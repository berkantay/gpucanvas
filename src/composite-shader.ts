/**
 * One instanced quad per visible node: its atlas snapshot, or a placeholder until one exists.
 *
 * Snapshots are kept when zooming out, so a quad often covers fewer pixels than its texels.
 * Plain bilinear filtering would then skip texels and shimmer while the camera moves, so the
 * fragment shader takes up to 4 x 4 samples spread over the pixel's footprint (a box filter),
 * clamped to the node's own atlas rectangle so neighbors never bleed in.
 */
export const compositeShader = /* wgsl */ `
struct View {
  size: vec2f,        // canvas size in CSS pixels
  origin: vec2f,      // camera position, world units
  zoom: f32,
  dpr: f32,
  atlasSize: f32,
  _pad: f32,
  placeholder: vec4f, // premultiplied color for nodes without a snapshot
}

@group(0) @binding(0) var<uniform> view: View;
@group(0) @binding(1) var atlas: texture_2d_array<f32>;
@group(0) @binding(2) var atlasSampler: sampler;

struct Instance {
  @location(0) rect: vec4f, // world x, y, width, height
  @location(1) uv: vec4f,   // atlas texels x0, y0, x1, y1
  @location(2) info: vec4f, // layer, placeholder flag
}

struct Varyings {
  @builtin(position) position: vec4f,
  @location(0) texel: vec2f,
  @location(1) @interpolate(flat) bounds: vec4f,
  @location(2) @interpolate(flat) info: vec2f,
}

@vertex
fn vs(@builtin(vertex_index) vertex: u32, instance: Instance) -> Varyings {
  let corner = vec2f(f32(vertex & 1u), f32(vertex >> 1u));
  // Snap edges to device pixels so a snapshot drawn at its raster scale stays crisp.
  let scale = view.zoom * view.dpr;
  let topLeft = round((instance.rect.xy - view.origin) * scale) / view.dpr;
  let bottomRight = round((instance.rect.xy + instance.rect.zw - view.origin) * scale) / view.dpr;
  let point = mix(topLeft, bottomRight, corner);
  var out: Varyings;
  out.position = vec4f(point.x / view.size.x * 2.0 - 1.0, 1.0 - point.y / view.size.y * 2.0, 0.0, 1.0);
  out.texel = mix(instance.uv.xy, instance.uv.zw, corner);
  // Half a texel inside the node's rectangle: the outermost sample center that cannot blend
  // with whatever sits next to it in the atlas.
  out.bounds = vec4f(instance.uv.xy + 0.5, instance.uv.zw - 0.5);
  out.info = instance.info.xy;
  return out;
}

@fragment
fn fs(in: Varyings) -> @location(0) vec4f {
  // Derivatives first: WGSL only allows them in uniform control flow.
  let dx = dpdx(in.texel);
  let dy = dpdy(in.texel);
  if (in.info.y > 0.5) {
    return view.placeholder;
  }
  let layer = i32(in.info.x);
  // Texels covered by this pixel along each screen axis.
  let footprint = vec2f(length(vec2f(dx.x, dy.x)), length(vec2f(dx.y, dy.y)));
  let taps = vec2u(clamp(ceil(footprint), vec2f(1.0), vec2f(4.0)));
  var color = vec4f(0.0);
  for (var j = 0u; j < taps.y; j++) {
    for (var i = 0u; i < taps.x; i++) {
      let offset = (vec2f(f32(i), f32(j)) + 0.5) / vec2f(taps) - 0.5;
      let texel = clamp(in.texel + offset * footprint, in.bounds.xy, in.bounds.zw);
      color += textureSampleLevel(atlas, atlasSampler, texel / view.atlasSize, layer, 0.0);
    }
  }
  return color / f32(taps.x * taps.y);
}
`;
