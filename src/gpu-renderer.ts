import type { Atlas } from './atlas';
import type { Camera, Point } from './camera';
import { compositeShader, effectShader } from './composite-shader';
import type { Effect } from './effects';

export const FLOATS_PER_INSTANCE = 16;

/** Consecutive instances drawn with one effect's pipeline, or the plain one (`effect` null). */
export interface Run {
  effect: Effect | null;
  start: number;
  count: number;
}

/**
 * Draws every visible node with instanced draw calls: one for the whole frame, or one per run of
 * nodes sharing an effect, in paint order. The caller fills `instances` with FLOATS_PER_INSTANCE
 * floats per quad: world rect, atlas texel rect (a ring's color), then layer, kind (0 snapshot,
 * 1 placeholder, 2 ring) and ring width or effect padding, then an effect's parameters.
 */
export class CompositeRenderer {
  instances = new Float32Array(FLOATS_PER_INSTANCE * 4096);
  private instanceBuffer: GPUBuffer;
  private readonly uniforms: GPUBuffer;
  private readonly uniformData = new Float32Array(20);
  private readonly pipeline: GPURenderPipeline;
  private readonly bindGroup: GPUBindGroup;
  private readonly bindGroupLayout: GPUBindGroupLayout;
  private readonly sampler: GPUSampler;
  /** Effect pipelines, null while one compiles. Compiling never blocks a frame. */
  private readonly effects = new Map<Effect, GPURenderPipeline | null>();
  /** Called when an effect pipeline is ready, so the caller can draw it. */
  onEffectReady: () => void = () => {};

  constructor(
    private readonly device: GPUDevice,
    private readonly context: GPUCanvasContext,
    format: GPUTextureFormat,
    private readonly atlas: Atlas,
    public background: [number, number, number, number],
    public placeholder: [number, number, number, number],
  ) {
    this.bindGroupLayout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: {} },
        {
          binding: 1,
          visibility: GPUShaderStage.FRAGMENT,
          texture: { viewDimension: '2d-array' },
        },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, sampler: {} },
      ],
    });
    this.sampler = device.createSampler({ magFilter: 'linear', minFilter: 'linear' });
    this.pipeline = device.createRenderPipeline(
      this.pipelineDescriptor('gpucanvas composite', compositeShader, format),
    );
    this.format = format;
    this.uniforms = device.createBuffer({
      size: this.uniformData.byteLength,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    this.bindGroup = device.createBindGroup({
      layout: this.bindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: this.uniforms } },
        { binding: 1, resource: atlas.view },
        { binding: 2, resource: this.sampler },
      ],
    });
    this.instanceBuffer = this.createInstanceBuffer();
  }

  private readonly format: GPUTextureFormat;

  private pipelineDescriptor(
    label: string,
    code: string,
    format: GPUTextureFormat,
  ): GPURenderPipelineDescriptor {
    const module = this.device.createShaderModule({ label, code });
    return {
      label,
      layout: this.device.createPipelineLayout({ bindGroupLayouts: [this.bindGroupLayout] }),
      vertex: {
        module,
        entryPoint: 'vs',
        buffers: [
          {
            arrayStride: FLOATS_PER_INSTANCE * 4,
            stepMode: 'instance',
            attributes: [
              { shaderLocation: 0, offset: 0, format: 'float32x4' },
              { shaderLocation: 1, offset: 16, format: 'float32x4' },
              { shaderLocation: 2, offset: 32, format: 'float32x4' },
              { shaderLocation: 3, offset: 48, format: 'float32x4' },
            ],
          },
        ],
      },
      fragment: {
        module,
        entryPoint: 'fs',
        targets: [
          {
            format,
            // Snapshots are requested premultiplied.
            blend: {
              color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' },
              alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' },
            },
          },
        ],
      },
      primitive: { topology: 'triangle-strip' },
    };
  }

  /** Whether `effect` can draw this frame. The first ask starts compiling it. */
  hasEffect(effect: Effect): boolean {
    if (this.effects.has(effect)) return this.effects.get(effect) !== null;
    this.effects.set(effect, null);
    this.device
      .createRenderPipelineAsync(
        this.pipelineDescriptor(
          `gpucanvas effect ${effect.name}`,
          effectShader(effect.wgsl),
          this.format,
        ),
      )
      .then((pipeline) => {
        this.effects.set(effect, pipeline);
        this.onEffectReady();
      })
      .catch((error) => console.error(`[gpucanvas] effect "${effect.name}" failed`, error));
    return false;
  }

  /** Grows the CPU and GPU instance storage to hold at least `count` instances. */
  reserve(count: number) {
    const floats = count * FLOATS_PER_INSTANCE;
    if (this.instances.length >= floats) return;
    this.instances = new Float32Array(Math.max(floats, this.instances.length * 2));
    this.instanceBuffer.destroy();
    this.instanceBuffer = this.createInstanceBuffer();
  }

  draw(
    camera: Camera,
    cssWidth: number,
    cssHeight: number,
    dpr: number,
    count: number,
    runs: readonly Run[],
    /** Seconds since start, pointer and press in world units, seconds since the press. */
    effects: { time: number; pointer: Point; press: Point; sincePress: number },
  ) {
    const { device } = this;
    this.uniformData.set([
      cssWidth,
      cssHeight,
      camera.x,
      camera.y,
      camera.zoom,
      dpr,
      this.atlas.size,
      effects.time,
      ...this.placeholder,
      effects.pointer.x,
      effects.pointer.y,
      effects.press.x,
      effects.press.y,
      effects.sincePress,
    ]);
    device.queue.writeBuffer(this.uniforms, 0, this.uniformData);
    if (count > 0) {
      device.queue.writeBuffer(
        this.instanceBuffer,
        0,
        this.instances,
        0,
        count * FLOATS_PER_INSTANCE,
      );
    }
    const [r, g, b] = this.background;
    const encoder = device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: this.context.getCurrentTexture().createView(),
          clearValue: { r, g, b, a: 1 },
          loadOp: 'clear',
          storeOp: 'store',
        },
      ],
    });
    if (count > 0) {
      pass.setBindGroup(0, this.bindGroup);
      pass.setVertexBuffer(0, this.instanceBuffer);
      let current: GPURenderPipeline | null = null;
      for (const run of runs.length ? runs : [{ effect: null, start: 0, count }]) {
        const pipeline = (run.effect && this.effects.get(run.effect)) || this.pipeline;
        if (pipeline !== current) pass.setPipeline((current = pipeline));
        pass.draw(4, run.count, 0, run.start);
      }
    }
    pass.end();
    device.queue.submit([encoder.finish()]);
  }

  destroy() {
    this.instanceBuffer.destroy();
    this.uniforms.destroy();
  }

  private createInstanceBuffer() {
    return this.device.createBuffer({
      label: 'gpucanvas instances',
      size: this.instances.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
  }
}
