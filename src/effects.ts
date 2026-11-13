/**
 * Shader effects on live nodes. An effect is a WGSL function the GPU runs for every pixel of a
 * node's snapshot, so the component stays live DOM while it ripples, glows or dissolves.
 *
 * The function is `fn effect(input: EffectInput) -> vec4f`, returning a premultiplied color:
 *
 * ```wgsl
 * struct EffectInput {
 *   uv: vec2f,     // 0 to 1 across the node; outside that range in its padding
 *   size: vec2f,   // the node's size in CSS pixels
 *   time: f32,     // seconds since the canvas started
 *   zoom: f32,     // the camera's zoom
 *   params: vec4f, // the node's parameters, from setEffect
 * }
 * fn source(uv: vec2f) -> vec4f // the node's own pixels, transparent outside 0 to 1
 * ```
 */
export interface Effect {
  readonly name: string;
  readonly wgsl: string;
  /** Runs every frame while a node wearing it is in view, for effects that use `time`. */
  readonly animated: boolean;
  /** Parameters a node gets when `setEffect` leaves them out, up to four. */
  readonly params: readonly number[];
  /** How far past its node the effect draws, in CSS pixels: a glow's reach, a blur's spread. */
  readonly pad: number | ((params: readonly number[]) => number);
  /**
   * The same look as a CSS `filter`, for the DOM backend. Effects without one show their node
   * unchanged there.
   */
  readonly css?: (params: readonly number[], time: number) => string;
  /** Seconds an animated CSS look takes to repeat. Default 4. */
  readonly period?: number;
}

export interface EffectDefinition {
  name: string;
  wgsl: string;
  animated?: boolean;
  params?: readonly number[];
  pad?: Effect['pad'];
  css?: Effect['css'];
  period?: number;
}

export const defineEffect = (definition: EffectDefinition): Effect =>
  Object.freeze({
    animated: false,
    params: [],
    pad: 0,
    ...definition,
  });

/** Four parameters: the ones given, then the effect's defaults, then zero. */
export const effectParams = (effect: Effect, params?: ArrayLike<number>): number[] =>
  [0, 1, 2, 3].map((i) => params?.[i] ?? effect.params[i] ?? 0);

export const effectPad = (effect: Effect, params: readonly number[]) =>
  typeof effect.pad === 'function' ? effect.pad(params) : effect.pad;

/** CSS's hue-rotate matrix, so the GPU and DOM looks match. */
const HUE_ROTATE = /* wgsl */ `
fn hueRotate(color: vec3f, degrees: f32) -> vec3f {
  let c = cos(radians(degrees));
  let s = sin(radians(degrees));
  let m = mat3x3f(
    vec3f(0.213 + 0.787 * c - 0.213 * s, 0.213 - 0.213 * c + 0.143 * s, 0.213 - 0.213 * c - 0.787 * s),
    vec3f(0.715 - 0.715 * c - 0.715 * s, 0.715 + 0.285 * c + 0.140 * s, 0.715 - 0.715 * c + 0.715 * s),
    vec3f(0.072 - 0.072 * c + 0.928 * s, 0.072 - 0.072 * c - 0.283 * s, 0.072 + 0.928 * c + 0.072 * s),
  );
  return m * color;
}
`;

/** Cycles hues. Parameters: degrees per second (default 90). */
export const hue = defineEffect({
  name: 'hue',
  animated: true,
  params: [90],
  wgsl: /* wgsl */ `${HUE_ROTATE}
fn effect(input: EffectInput) -> vec4f {
  let color = source(input.uv);
  return vec4f(clamp(hueRotate(color.rgb, input.time * input.params.x), vec3f(0.0), vec3f(color.a)), color.a);
}`,
  css: ([speed], time) => `hue-rotate(${((time * speed) % 360).toFixed(1)}deg)`,
});

/** Gray. Parameters: amount, 0 to 1 (default 1). */
export const grayscale = defineEffect({
  name: 'grayscale',
  params: [1],
  wgsl: /* wgsl */ `
fn effect(input: EffectInput) -> vec4f {
  let color = source(input.uv);
  let gray = dot(color.rgb, vec3f(0.2126, 0.7152, 0.0722));
  return vec4f(mix(color.rgb, vec3f(gray), input.params.x), color.a);
}`,
  css: ([amount]) => `grayscale(${amount})`,
});

/** Blur over 32 taps on a disk. Parameters: radius in CSS pixels (default 6). */
export const blur = defineEffect({
  name: 'blur',
  params: [6],
  pad: ([radius]) => radius,
  wgsl: /* wgsl */ `
fn effect(input: EffectInput) -> vec4f {
  let radius = input.params.x / input.size;
  var color = vec4f(0.0);
  var weight = 0.0;
  // A Vogel spiral: even coverage of the disk with few taps.
  for (var i = 0u; i < 32u; i++) {
    let r = sqrt((f32(i) + 0.5) / 32.0);
    let a = f32(i) * 2.39996;
    let w = exp(-2.0 * r * r);
    color += source(input.uv + vec2f(cos(a), sin(a)) * r * radius) * w;
    weight += w;
  }
  return color / weight;
}`,
  css: ([radius]) => `blur(${radius / 2}px)`,
});

/**
 * A breathing glow around the node's shape. Parameters: red, green, blue (0 to 1) and reach in
 * CSS pixels (default a blue 24 px).
 */
export const glow = defineEffect({
  name: 'glow',
  animated: true,
  params: [0.31, 0.55, 1, 24],
  pad: (params) => params[3],
  period: Math.PI,
  wgsl: /* wgsl */ `
fn effect(input: EffectInput) -> vec4f {
  let color = source(input.uv);
  let reach = input.params.w * (0.65 + 0.35 * sin(input.time * 2.0));
  // How much of the shape lies within reach, sampled on two rings.
  var cover = 0.0;
  for (var i = 0u; i < 24u; i++) {
    let a = f32(i) * 0.2618;
    let r = select(0.5, 1.0, i % 2u == 0u);
    cover += source(input.uv + vec2f(cos(a), sin(a)) * r * reach / input.size).a;
  }
  let alpha = smoothstep(0.0, 1.0, cover / 24.0) * 0.9;
  return color + vec4f(input.params.rgb * alpha, alpha) * (1.0 - color.a);
}`,
  css: ([r, g, b, reach], time) => {
    const radius = reach * (0.65 + 0.35 * Math.sin(time * 2));
    const rgb = [r, g, b].map((v) => Math.round(v * 255)).join(' ');
    return `drop-shadow(0 0 ${(radius / 2).toFixed(1)}px rgb(${rgb} / 0.9))`;
  },
});

/** Rings spreading from the center. Parameters: amplitude and wavelength in CSS pixels (6, 90). */
export const ripple = defineEffect({
  name: 'ripple',
  animated: true,
  params: [6, 90],
  pad: ([amplitude]) => amplitude,
  wgsl: /* wgsl */ `
fn effect(input: EffectInput) -> vec4f {
  let p = (input.uv - 0.5) * input.size;
  let d = length(p);
  let wave = sin(d / input.params.y * 6.2832 - input.time * 4.0);
  let push = select(vec2f(0.0), p / d, d > 0.001) * wave * input.params.x;
  let color = source(input.uv + push / input.size);
  return vec4f(color.rgb * (1.0 + 0.06 * wave), color.a);
}`,
});

/** Big pixels. Parameters: block size in CSS pixels (default 8). */
export const pixelate = defineEffect({
  name: 'pixelate',
  params: [8],
  wgsl: /* wgsl */ `
fn effect(input: EffectInput) -> vec4f {
  let block = max(input.params.x, 1.0);
  let cell = (floor(input.uv * input.size / block) + 0.5) * block;
  return source(cell / input.size);
}`,
});

/**
 * Burns away along noise with a glowing edge, for a node leaving or arriving. Parameters:
 * progress, 0 (whole) to 1 (gone).
 */
export const dissolve = defineEffect({
  name: 'dissolve',
  params: [0.5],
  wgsl: /* wgsl */ `
fn hash(p: vec2f) -> f32 {
  return fract(sin(dot(p, vec2f(127.1, 311.7))) * 43758.5453);
}
fn noise(p: vec2f) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2f(1.0, 0.0)), u.x),
             mix(hash(i + vec2f(0.0, 1.0)), hash(i + vec2f(1.0, 1.0)), u.x), u.y);
}
fn effect(input: EffectInput) -> vec4f {
  let color = source(input.uv);
  let p = input.uv * input.size / 24.0;
  let n = noise(p) * 0.65 + noise(p * 2.7) * 0.35;
  let edge = n - (input.params.x * 1.2 - 0.1);
  let keep = smoothstep(0.0, 0.02, edge);
  let burn = (1.0 - smoothstep(0.0, 0.08, edge)) * keep;
  return color * keep + vec4f(1.0, 0.45, 0.1, 1.0) * burn * color.a;
}`,
  css: ([progress]) => `opacity(${1 - progress})`,
});

export const EFFECTS = { hue, glow, blur, ripple, pixelate, dissolve, grayscale } as const;
