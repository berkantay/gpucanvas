import type { Atlas } from './atlas';
import type { Camera } from './camera';
import { compositeShader } from './composite-shader';

export const FLOATS_PER_INSTANCE = 12;

/**
 * Draws every visible node in one instanced draw call. The caller fills `instances` with
 * FLOATS_PER_INSTANCE floats per quad: world rect, atlas texel rect (a ring's color), then layer,
 * kind (0 snapshot, 1 placeholder, 2 ring) and ring width.
 */
export class CompositeRenderer {
  instances = new Float32Array(FLOATS_PER_INSTANCE * 4096);
  private instanceBuffer: GPUBuffer;
  private readonly uniforms: GPUBuffer;
  private readonly uniformData = new Float32Array(12);
  private readonly pipeline: GPURenderPipeline;
  private readonly bindGroup: GPUBindGroup;

  constructor(
    private readonly device: GPUDevice,
    private readonly context: GPUCanvasContext,
    format: GPUTextureFormat,
    private readonly atlas: Atlas,
    public background: [number, number, number, number],
    public placeholder: [number, number, number, number],
  ) {
    const module = device.createShaderModule({
      label: 'gpucanvas composite',
      code: compositeShader,
    });
    this.pipeline = device.createRenderPipeline({
      label: 'gpucanvas composite',
      layout: 'auto',
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
    });
    this.uniforms = device.createBuffer({
      size: this.uniformData.byteLength,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    this.bindGroup = device.createBindGroup({
      layout: this.pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.uniforms } },
        { binding: 1, resource: atlas.view },
        {
          binding: 2,
          resource: device.createSampler({ magFilter: 'linear', minFilter: 'linear' }),
        },
      ],
    });
    this.instanceBuffer = this.createInstanceBuffer();
  }

  /** Grows the CPU and GPU instance storage to hold at least `count` instances. */
  reserve(count: number) {
    const floats = count * FLOATS_PER_INSTANCE;
    if (this.instances.length >= floats) return;
    this.instances = new Float32Array(Math.max(floats, this.instances.length * 2));
    this.instanceBuffer.destroy();
    this.instanceBuffer = this.createInstanceBuffer();
  }

  draw(camera: Camera, cssWidth: number, cssHeight: number, dpr: number, count: number) {
    const { device } = this;
    this.uniformData.set([
      cssWidth,
      cssHeight,
      camera.x,
      camera.y,
      camera.zoom,
      dpr,
      this.atlas.size,
      0,
      ...this.placeholder,
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
      pass.setPipeline(this.pipeline);
      pass.setBindGroup(0, this.bindGroup);
      pass.setVertexBuffer(0, this.instanceBuffer);
      pass.draw(4, count);
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
