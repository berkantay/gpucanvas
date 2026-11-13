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
 *   pointer: vec2f,  // the pointer, in the node's uv; far away when it is off the canvas
 *   press: vec2f,    // where the last press landed, in the node's uv
 *   sincePress: f32, // seconds since that press
 * }
 * fn source(uv: vec2f) -> vec4f // the node's own pixels, transparent outside 0 to 1
 * fn hash(p: vec2f) -> f32      // a pseudo-random value from 0 to 1
 * fn noise(p: vec2f) -> f32     // smooth value noise from 0 to 1
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

/** Fades out. Parameters: progress, 0 (whole) to 1 (gone). */
export const fade = defineEffect({
  name: 'fade',
  params: [0.5],
  wgsl: /* wgsl */ `
fn effect(input: EffectInput) -> vec4f {
  return source(input.uv) * (1.0 - input.params.x);
}`,
  css: ([progress]) => `opacity(${1 - progress})`,
});

/**
 * Wipes away with a soft edge. Parameters: progress, 0 (whole) to 1 (gone); the direction it
 * wipes toward in degrees, 0 for left to right (default 0); the edge's softness in CSS pixels
 * (default 32).
 */
export const wipe = defineEffect({
  name: 'wipe',
  params: [0.5, 0, 32],
  wgsl: /* wgsl */ `
fn effect(input: EffectInput) -> vec4f {
  let angle = radians(input.params.y);
  let toward = vec2f(cos(angle), sin(angle));
  let half = input.size * 0.5;
  let extent = abs(toward.x) * half.x + abs(toward.y) * half.y;
  // 0 where the wipe starts, 1 where it ends.
  let along = (dot(input.uv * input.size - half, toward) / extent + 1.0) * 0.5;
  let soft = max(input.params.z, 0.5) / (2.0 * extent);
  let edge = input.params.x * (1.0 + soft);
  return source(input.uv) * smoothstep(edge - soft, edge, along);
}`,
  css: ([progress]) => `opacity(${1 - progress})`,
});

/**
 * A glass lens that follows the pointer, magnifying what is under it with a colored rim.
 * Parameters: radius in CSS pixels and magnification (default 110, 1.8).
 */
export const glass = defineEffect({
  name: 'glass',
  animated: true,
  params: [110, 1.8],
  wgsl: /* wgsl */ `
fn effect(input: EffectInput) -> vec4f {
  let d = (input.uv - input.pointer) * input.size;
  let radius = input.params.x;
  let t = length(d) / radius;
  if (t >= 1.0) {
    let shadow = (1.0 - smoothstep(1.0, 1.12, t)) * 0.18;
    let under = source(input.uv);
    return vec4f(under.rgb * (1.0 - shadow), under.a);
  }
  // A dome: strongest at the center, flattening to no change at the rim.
  let scale = mix(1.0 / input.params.y, 1.0, t * t * t);
  let bent = input.pointer + d * scale / input.size;
  let fringe = d / radius * (t * t * 6.0) / input.size;
  let middle = source(bent);
  var color = vec4f(source(bent + fringe).r, middle.g, source(bent - fringe).b, middle.a);
  // A bright rim and a highlight up and to the left.
  let rim = smoothstep(0.86, 0.97, t) * (1.0 - smoothstep(0.985, 1.0, t));
  let shine = pow(max(0.0, 1.0 - length(d / radius - vec2f(-0.38, -0.42)) / 0.42), 2.0);
  // Light catches the upper left of the rim, and the lower right falls into shade.
  let side = dot(normalize(d + vec2f(0.0001)), vec2f(-0.7071, -0.7071));
  let light = rim * (0.25 + 0.35 * side) + shine * 0.3;
  let shade = rim * max(0.0, -side) * 0.25;
  color = vec4f(color.rgb * (1.0 - shade), color.a);
  color = color + vec4f(light, light, light, light) * (1.0 - color.a * 0.4);
  return min(color, vec4f(1.0));
}`,
});

/**
 * A ring of light that bends the node as it spreads from each press. Parameters: speed in CSS
 * pixels per second, ring width and push (default 900, 60, 18).
 */
export const shockwave = defineEffect({
  name: 'shockwave',
  animated: true,
  params: [900, 60, 18],
  wgsl: /* wgsl */ `
fn effect(input: EffectInput) -> vec4f {
  let fade = exp(-input.sincePress * 1.6);
  if (fade < 0.01) {
    return source(input.uv);
  }
  let d = (input.uv - input.press) * input.size;
  let dist = length(d);
  let x = (dist - input.sincePress * input.params.x) / input.params.y;
  let ring = exp(-x * x);
  let push = select(vec2f(0.0), d / dist, dist > 0.001) * sin(x * 2.5) * ring * input.params.z * fade;
  let offset = push / input.size;
  let middle = source(input.uv - offset);
  let color = vec4f(source(input.uv - offset * 1.4).r, middle.g, source(input.uv - offset * 0.6).b, middle.a);
  return color + vec4f(0.45, 0.65, 1.0, 1.0) * ring * fade * 0.25 * middle.a;
}`,
});

/** Broadcast glitches: torn rows, split color channels and corrupted blocks, in bursts. */
export const glitch = defineEffect({
  name: 'glitch',
  animated: true,
  wgsl: /* wgsl */ `
fn effect(input: EffectInput) -> vec4f {
  // Every node glitches on its own schedule.
  let own = hash(input.size);
  let tick = floor(input.time * 12.0 + own * 50.0);
  let burst = step(0.82, hash(vec2f(floor(tick / 3.0), own)));
  if (burst == 0.0) {
    return source(input.uv);
  }
  let row = floor(input.uv.y * mix(12.0, 40.0, hash(vec2f(tick, 1.0))));
  let tear = step(0.6, hash(vec2f(row, tick))) * (hash(vec2f(row, tick + 7.0)) - 0.5) * 0.06;
  let uv = vec2f(input.uv.x + tear, input.uv.y);
  let split = vec2f(0.012 * hash(vec2f(tick, 3.0)), 0.0);
  let middle = source(uv);
  var color = vec4f(source(uv + split).r, middle.g, source(uv - split).b, middle.a);
  // A few blocks show pixels from elsewhere, with their channels swapped.
  let block = floor(input.uv * vec2f(14.0, 8.0));
  if (hash(block + vec2f(tick)) > 0.975) {
    let moved = source(fract(input.uv + vec2f(hash(block), hash(block + 9.0)) * 0.3));
    color = vec4f(moved.brg, moved.a);
  }
  return color;
}`,
});

/** Worn tape: a wavering picture, color bleeding sideways, a rolling band, noise and grain. */
export const vhs = defineEffect({
  name: 'vhs',
  animated: true,
  wgsl: /* wgsl */ `
fn effect(input: EffectInput) -> vec4f {
  let y = input.uv.y;
  let t = input.time;
  var wave = sin(y * 38.0 + t * 3.0) * 0.0012 + sin(y * 6.0 - t * 1.3) * 0.002;
  // Head-switching noise along the bottom.
  let bottom = smoothstep(0.93, 1.0, y);
  wave += bottom * (hash(vec2f(floor(y * 180.0), floor(t * 30.0))) - 0.5) * 0.04;
  let uv = vec2f(input.uv.x + wave, y);
  let bleed = vec2f(3.0 / input.size.x, 0.0);
  let middle = source(uv);
  var color = vec4f(source(uv + bleed).r, middle.g, source(uv - bleed * 1.5).b, middle.a);
  // Softer, warmer and a little washed out.
  let gray = dot(color.rgb, vec3f(0.299, 0.587, 0.114));
  color = vec4f(mix(vec3f(gray), color.rgb, 0.8) * vec3f(1.04, 1.0, 0.92), color.a);
  let band = smoothstep(0.08, 0.0, abs(fract(y * 0.6 - t * 0.12) - 0.5));
  let lines = 0.94 + 0.06 * sin(y * input.size.y * 3.1416);
  let grain = (hash(input.uv * input.size + vec2f(t * 97.0, t * 61.0)) - 0.5) * 0.12;
  return vec4f(clamp(color.rgb * lines + (band * 0.08 + grain) * color.a, vec3f(0.0), vec3f(color.a)), color.a);
}`,
});

/**
 * Ice over the node, clear where the pointer is. Parameters: the clear radius in CSS pixels
 * (default 140).
 */
export const frost = defineEffect({
  name: 'frost',
  animated: true,
  params: [140],
  wgsl: /* wgsl */ `
fn effect(input: EffectInput) -> vec4f {
  let p = input.uv * input.size;
  let dist = length((input.uv - input.pointer) * input.size);
  let edge = noise(p / 40.0) * 50.0;
  let ice = smoothstep(input.params.x * 0.55, input.params.x * 1.2, dist + edge);
  if (ice <= 0.0) {
    return source(input.uv);
  }
  // Frosted glass: the node seen blurred and bent through uneven ice.
  let thick = noise(p / 90.0) * 0.6 + noise(p / 23.0) * 0.4;
  let bend = (vec2f(noise(p / 14.0), noise(p / 14.0 + 31.0)) - 0.5) * 6.0 * ice;
  var color = vec4f(0.0);
  for (var i = 0u; i < 8u; i++) {
    let a = f32(i) * 0.7854 + 0.4;
    let r = select(3.0, 6.0, i % 2u == 0u) * ice;
    color += source((p + bend + vec2f(cos(a), sin(a)) * r) / input.size);
  }
  color /= 8.0;
  let white = vec4f(0.9, 0.95, 1.0, 1.0) * color.a;
  // Feathery crystals and a few glints.
  let crystals = smoothstep(0.7, 0.95, noise(p / 12.0 + noise(p / 40.0) * 2.0)) * 0.1;
  let glint = step(0.997, hash(floor(p / 1.5))) * 0.8;
  let frosted = mix(color, white, (0.3 + thick * 0.25) * ice);
  return min(frosted + vec4f((crystals + glint) * ice) * color.a, vec4f(color.a));
}`,
});

/**
 * A lens that redraws what is under the pointer in big dithered pixels and a few colors.
 * Parameters: radius and pixel size in CSS pixels (default 130, 4).
 */
export const dither = defineEffect({
  name: 'dither',
  animated: true,
  params: [130, 4],
  wgsl: /* wgsl */ `
fn effect(input: EffectInput) -> vec4f {
  let p = input.uv * input.size;
  let dist = length((input.uv - input.pointer) * input.size);
  let radius = input.params.x;
  if (dist > radius + 1.5) {
    return source(input.uv);
  }
  let block = max(input.params.y, 1.0);
  let cell = floor(p / block);
  let base = source((cell + 0.5) * block / input.size);
  var bayer = array<f32, 16>(0.0, 8.0, 2.0, 10.0, 12.0, 4.0, 14.0, 6.0, 3.0, 11.0, 1.0, 9.0, 15.0, 7.0, 13.0, 5.0);
  let index = u32(cell.x) % 4u + (u32(cell.y) % 4u) * 4u;
  let threshold = (bayer[index] + 0.5) / 16.0 - 0.5;
  // Two levels per channel: eight colors, mixed by the pattern.
  let straight = base.rgb / max(base.a, 0.0001);
  let levels = floor(clamp(straight + threshold * 0.6, vec3f(0.0), vec3f(1.0)) + 0.5);
  let dithered = vec4f(levels * base.a, base.a);
  let ring = 1.0 - smoothstep(0.0, 1.5, abs(dist - radius));
  return mix(dithered, vec4f(0.1, 0.1, 0.12, 1.0), ring * 0.8);
}`,
});

export const EFFECTS = {
  glass,
  shockwave,
  glitch,
  vhs,
  frost,
  dither,
  glow,
  hue,
  ripple,
  blur,
  pixelate,
  dissolve,
  fade,
  wipe,
  grayscale,
} as const;
