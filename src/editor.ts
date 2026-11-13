import { screenToWorld, visibleWorldRect, type Point, type Rect } from './camera';
import {
  createLayers,
  layerIn,
  layerRect,
  sameLayer,
  unionRect,
  type EditorPick,
  type Layer,
} from './layers';
import { createOverlay, guideRect, type Handle } from './overlay';
import { snapRect, type Guide } from './snap';
import { DEFAULT_SELECTION_COLOR, type GpuCanvas } from './types';

export interface TransformEvent {
  phase: 'start' | 'move' | 'end' | 'cancel';
  kind: 'move' | 'resize';
  /** What is being moved or resized. */
  layers: Layer[];
  /** Each layer's rect when the gesture started, world units. */
  from: Rect[];
  /** Where each layer should be now. On `cancel` it equals `from`. */
  to: Rect[];
}

export interface EditorOptions {
  /** What a click can select, and how deep a double-click goes. Default `'node'`. */
  pick?: EditorPick;
  /**
   * `'shift-click'` (default): clicks still reach the components. Shift-click selects,
   * shift-cmd-click (shift-ctrl-click) adds or removes, shift-drag draws a selection box.
   * `'click'`: an edit mode. Every click selects, shift-click adds or removes, drags move, and
   * shift-drag on the background draws a selection box.
   * In the edit mode, a double-click on a text field starts typing in it, and Escape or a click
   * elsewhere ends it. Either way, a double-click goes one layer deeper, and a drag on the open
   * area of the layer you are inside draws a box over its children.
   */
  trigger?: 'shift-click' | 'click';
  /** Outlines what a click would select. With `'shift-click'`, only while shift is held. Default true. */
  hover?: boolean;
  /** Shift-drag draws a box that selects the layers it touches. Default true. */
  marquee?: boolean;
  /** Names and sizes next to the selection and the hovered layer. Default true. */
  labels?: boolean;
  /** A layer's name for its label. Default: the element's tag inside nodes, nothing for nodes. */
  label?: (layer: Layer) => string | null;
  /** Moves and resizes snap to the edges and centers of their neighbors. Default true. */
  snap?: boolean;
  /** Called with the new selection after every change. */
  onChange?: (selected: Layer[]) => void;
  /**
   * Called through every move and resize. The editor never moves anything itself: apply `to`
   * (`updateNode`, state, styles) to make it real. Handles and drag-to-move need this and the
   * `'click'` trigger.
   */
  onTransform?: (event: TransformEvent) => void;
  /** Labels, frame and handles. Default `#4f8cff`. */
  color?: string;
}

export interface Editor {
  get(): Layer[];
  /** Selects these layers at the top level. */
  set(layers: Iterable<Element | Element[]>): void;
  clear(): void;
  /** Removes the listeners, the chrome and the outlines. */
  destroy(): void;
}

type MarqueeCanvas = Pick<GpuCanvas, 'surface' | 'getCamera' | 'getNodesIn' | 'setSelection'>;

/**
 * A selection box over the canvas, in surface pixels. What it overlaps is selected as it grows,
 * by default every node, so the outlines sweep across the canvas with it.
 */
export function createMarquee(
  canvas: MarqueeCanvas,
  color = DEFAULT_SELECTION_COLOR,
  select: (world: Rect) => Element[] = (world) => canvas.getNodesIn(world),
) {
  const box = document.createElement('div');
  Object.assign(box.style, {
    position: 'absolute',
    display: 'none',
    pointerEvents: 'none',
    border: `1px solid ${color}`,
    background: `color-mix(in srgb, ${color} 12%, transparent)`,
    zIndex: '1',
  });
  canvas.surface.append(box);
  return {
    /** Spans the box from `a` to `b` (surface pixels) and selects what it covers. */
    update(a: Point, b: Point): Element[] {
      const x = Math.min(a.x, b.x);
      const y = Math.min(a.y, b.y);
      const width = Math.abs(b.x - a.x);
      const height = Math.abs(b.y - a.y);
      Object.assign(box.style, {
        display: 'block',
        left: `${x}px`,
        top: `${y}px`,
        width: `${width}px`,
        height: `${height}px`,
      });
      const camera = canvas.getCamera();
      const hits = select({
        ...screenToWorld(camera, { x, y }),
        width: width / camera.zoom,
        height: height / camera.zoom,
      });
      canvas.setSelection(hits);
      return hits;
    },
    hide() {
      box.style.display = 'none';
    },
    remove() {
      box.remove();
    },
  };
}

/** How far a press may move and still count as a click, in CSS pixels. */
const CLICK_SLOP = 4;
/** How close an edge has to come to snap, in CSS pixels. */
const SNAP_PX = 6;
/** Above this many layers the selection shows one size, not each name. */
const MAX_NAMED = 1;

const isEditable = (element: Element | null) =>
  !!element &&
  (element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement ||
    element instanceof HTMLSelectElement ||
    (element as HTMLElement).isContentEditable);

type Gesture =
  /** `inside`: the press is on the open area of the scope itself, where a drag draws a box. */
  | { kind: 'press'; start: Point; additive: boolean; target: Target; inside: boolean }
  | { kind: 'marquee'; start: Point }
  | {
      kind: 'move' | 'resize';
      start: Point;
      handle: Handle | null;
      layers: Layer[];
      from: Rect[];
      bounds: Rect;
      to: Rect[];
      targets: Rect[];
      guides: Guide[];
    };

/** A layer a click lands on, and the layers it sits inside, outermost first. */
interface Target {
  layer: Layer;
  scopes: Layer[];
}

/**
 * A canvas editor's selection: click, double-click to go deeper, hover, box selection,
 * keyboard navigation, labels, and moving and resizing with snapping. The canvas draws the
 * outlines; the editor draws the rest above it.
 */
export function bindEditor(canvas: GpuCanvas, options: EditorOptions = {}): Editor {
  const {
    pick = 'node',
    trigger = 'shift-click',
    hover = true,
    marquee = true,
    labels = true,
    snap = true,
    color = DEFAULT_SELECTION_COLOR,
    onChange,
    onTransform,
  } = options;
  const label =
    options.label ??
    ((layer: Layer) => (canvas.getNodeOf(layer[0]) === layer[0] ? null : layer[0].localName));
  const { surface } = canvas;
  const layers = createLayers(canvas, pick);
  const transforms = !!onTransform && trigger === 'click';
  const overlay = createOverlay(surface, color, color);
  let marqueeLayers: Layer[] = [];
  const box = marquee
    ? createMarquee(canvas, color, (world) => {
        marqueeLayers = layers.layersIn(scopes.at(-1) ?? null, world);
        return marqueeLayers.flat();
      })
    : null;

  let selection: Layer[] = [];
  /** The layers the selection sits inside, outermost first. Clicks stay at its depth. */
  let scopes: Layer[] = [];
  let hovered: Layer | null = null;
  let gesture: Gesture | null = null;
  let pointer: Point | null = null;
  let shift = false;
  let swallowClick = false;
  /** The press is on the field being typed in, but the browser routed it elsewhere. */
  let keepFocus = false;

  const commit = (next: Layer[], nextScopes: Layer[] = scopes) => {
    selection = next.filter((layer, i) => next.findIndex((other) => sameLayer(layer, other)) === i);
    scopes = selection.length ? nextScopes : [];
    canvas.setSelection(selection.flat());
    onChange?.(selection);
    draw();
  };
  const setHovered = (layer: Layer | null) => {
    if (sameLayer(layer, hovered) || layer === hovered) return;
    hovered = layer;
    canvas.setHover(layer?.[0] ?? null);
    draw();
  };
  const at = (event: MouseEvent): Point => {
    const bounds = surface.getBoundingClientRect();
    return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
  };
  const chainAt = (point: Point) => layers.chainAt(canvas.screenToWorld(point));
  /** The text field, select or contenteditable under a surface point. */
  const fieldAt = (point: Point) => {
    const element = canvas.getElementAt(canvas.screenToWorld(point));
    const field = element?.closest('input, textarea, select, [contenteditable]') ?? null;
    return isEditable(field) ? (field as HTMLElement) : null;
  };
  /** The field being typed in, when it is on this canvas. */
  const typingIn = () => {
    const active = document.activeElement;
    return isEditable(active) && canvas.getNodeOf(active!) ? (active as HTMLElement) : null;
  };
  /** What a click lands on: inside the deepest scope on the chain, one level down from it. */
  const targetIn = (chain: Layer[]): Target | null => {
    if (!chain.length) return null;
    for (let i = scopes.length - 1; i >= 0; i--) {
      const k = chain.findIndex((layer) => sameLayer(layer, scopes[i]));
      if (k < 0) continue;
      return k + 1 < chain.length
        ? { layer: chain[k + 1], scopes: chain.slice(0, k + 1) }
        : { layer: chain[k], scopes: chain.slice(0, k) };
    }
    return { layer: chain[0], scopes: [] };
  };
  const selecting = (withShift: boolean) => trigger === 'click' || withShift;
  const updateHover = () => {
    const show = hover && pointer && !gesture && selecting(shift);
    setHovered(show ? (targetIn(chainAt(pointer!))?.layer ?? null) : null);
  };

  // ----- chrome ---------------------------------------------------------------------------

  let frame = 0;
  /** Redraws the chrome every frame while there is any, so it follows the camera and layout. */
  const draw = () => {
    if (!frame) frame = requestAnimationFrame(render);
  };
  const toScreen = (rect: Rect): Rect => {
    const { x, y } = canvas.worldToScreen(rect);
    const zoom = canvas.getCamera().zoom;
    return { x, y, width: rect.width * zoom, height: rect.height * zoom };
  };
  const unionOf = (rects: (Rect | null)[]) =>
    rects.reduce<Rect | null>(
      (union, rect) => (!rect ? union : union ? unionRect(union, rect) : rect),
      null,
    );
  const render = () => {
    frame = 0;
    const transforming = gesture?.kind === 'move' || gesture?.kind === 'resize' ? gesture : null;
    const world = transforming
      ? unionOf(transforming.to)
      : selection.length
        ? unionOf(selection.map((layer) => layerRect(canvas, layer)))
        : null;
    const hoverRect = hovered && !layerIn(hovered, selection) ? layerRect(canvas, hovered) : null;
    overlay.render({
      hover: labels && hoverRect ? { rect: toScreen(hoverRect), name: label(hovered!) } : null,
      selection:
        labels && world
          ? {
              rect: toScreen(world),
              size: world,
              name: selection.length <= MAX_NAMED ? label(selection[0]) : null,
              count: selection.length,
            }
          : null,
      bounds: selection.length > 1 || !!transforming,
      handles: transforms && selection.length > 0 && gesture?.kind !== 'marquee',
      guides: transforming
        ? transforming.guides.map((guide) =>
            guideRect(guide, (x, y) => canvas.worldToScreen({ x, y })),
          )
        : [],
    });
    if (selection.length || hovered || gesture) draw();
  };

  // ----- moving and resizing ----------------------------------------------------------------

  const emit = (phase: TransformEvent['phase']) => {
    if (gesture?.kind !== 'move' && gesture?.kind !== 'resize') return;
    onTransform?.({
      phase,
      kind: gesture.kind,
      layers: gesture.layers,
      from: gesture.from,
      to: phase === 'cancel' ? gesture.from : gesture.to,
    });
  };
  /** Neighbors to snap to: the other layers in the same scope, and the scope itself. */
  const snapTargets = (moving: Layer[]): Rect[] => {
    if (!snap) return [];
    const scope = scopes.at(-1);
    if (!scope) {
      const view = visibleWorldRect(canvas.getCamera(), surface.clientWidth, surface.clientHeight);
      return canvas
        .getNodesIn(view)
        .filter((node) => !moving.some((layer) => layer[0] === node))
        .map((node) => canvas.getNodeRect(node)!);
    }
    const rects = layers
      .childrenOf(scope)
      .filter((layer) => !layerIn(layer, moving))
      .map((layer) => layerRect(canvas, layer));
    return [layerRect(canvas, scope), ...rects].filter((rect): rect is Rect => !!rect);
  };
  const beginTransform = (start: Point, handle: Handle | null) => {
    const from = selection.map((layer) => layerRect(canvas, layer));
    if (from.some((rect) => !rect)) return;
    const rects = from as Rect[];
    gesture = {
      kind: handle ? 'resize' : 'move',
      start,
      handle,
      layers: selection,
      from: rects,
      bounds: unionOf(rects)!,
      to: rects,
      targets: snapTargets(selection),
      guides: [],
    };
    setHovered(null);
    emit('start');
  };
  const updateTransform = (point: Point, keepRatio: boolean) => {
    if (gesture?.kind !== 'move' && gesture?.kind !== 'resize') return;
    const zoom = canvas.getCamera().zoom;
    let dx = (point.x - gesture.start.x) / zoom;
    let dy = (point.y - gesture.start.y) / zoom;
    const { bounds, handle } = gesture;
    const threshold = SNAP_PX / zoom;
    let next: Rect;
    if (!handle) {
      // Shift keeps a move on its main axis.
      if (keepRatio) Math.abs(dx) > Math.abs(dy) ? (dy = 0) : (dx = 0);
      next = { ...bounds, x: bounds.x + dx, y: bounds.y + dy };
      const snapped = snapRect(next, gesture.targets, threshold);
      next = { ...next, x: next.x + snapped.dx, y: next.y + snapped.dy };
      gesture.guides = snapped.guides;
    } else {
      let left = bounds.x;
      let top = bounds.y;
      let right = bounds.x + bounds.width;
      let bottom = bounds.y + bounds.height;
      if (handle.includes('w')) left = Math.min(left + dx, right - 1);
      if (handle.includes('e')) right = Math.max(right + dx, left + 1);
      if (handle.includes('n')) top = Math.min(top + dy, bottom - 1);
      if (handle.includes('s')) bottom = Math.max(bottom + dy, top + 1);
      next = { x: left, y: top, width: right - left, height: bottom - top };
      const corner = handle.length === 2;
      if (keepRatio && corner) {
        // Shift on a corner keeps the proportions, anchored at the opposite corner.
        const scale = Math.max(next.width / bounds.width, next.height / bounds.height);
        const width = bounds.width * scale;
        const height = bounds.height * scale;
        next = {
          x: handle.includes('w') ? right - width : left,
          y: handle.includes('n') ? bottom - height : top,
          width,
          height,
        };
        gesture.guides = [];
      } else {
        const edges = {
          x: handle.includes('w') ? [0] : handle.includes('e') ? [1] : [],
          y: handle.includes('n') ? [0] : handle.includes('s') ? [1] : [],
        };
        const snapped = snapRect(next, gesture.targets, threshold, edges);
        if (edges.x[0] === 0)
          next = { ...next, x: next.x + snapped.dx, width: next.width - snapped.dx };
        if (edges.x[0] === 1) next = { ...next, width: next.width + snapped.dx };
        if (edges.y[0] === 0)
          next = { ...next, y: next.y + snapped.dy, height: next.height - snapped.dy };
        if (edges.y[0] === 1) next = { ...next, height: next.height + snapped.dy };
        gesture.guides = snapped.guides;
      }
    }
    // Every layer keeps its place inside the group.
    const sx = next.width / bounds.width;
    const sy = next.height / bounds.height;
    gesture.to = gesture.from.map((rect) => ({
      x: next.x + (rect.x - bounds.x) * sx,
      y: next.y + (rect.y - bounds.y) * sy,
      width: rect.width * sx,
      height: rect.height * sy,
    }));
    emit('move');
    draw();
  };

  // ----- input ------------------------------------------------------------------------------

  const onPointerDown = (event: PointerEvent) => {
    shift = event.shiftKey;
    swallowClick = false;
    if (event.button !== 0) return;
    const point = at(event);
    // Presses inside the field being typed in reach it: the caret, text selection.
    const field = typingIn();
    keepFocus = false;
    if (field && field.contains(fieldAt(point))) {
      keepFocus = !field.contains(event.target as globalThis.Node);
      return;
    }
    const take = () => {
      // Nothing under the pointer sees this press, nor the click it ends in. The press that
      // would have moved focus out of a field ends typing there instead.
      event.stopPropagation();
      field?.blur();
      swallowClick = true;
      surface.setPointerCapture(event.pointerId);
    };
    const handle = (event.target as Element).closest?.<HTMLElement>('[data-gpucanvas-handle]');
    if (handle && transforms) {
      take();
      return beginTransform(point, handle.dataset.gpucanvasHandle as Handle);
    }
    const target = targetIn(chainAt(point));
    if (!target) {
      if (event.shiftKey && box) {
        take();
        gesture = { kind: 'marquee', start: point };
        return;
      }
      // A plain press on the background clears, and still pans the camera.
      if (selection.length) commit([], []);
      return;
    }
    if (!selecting(event.shiftKey)) return;
    take();
    // Adding and removing is shift-click in the edit mode, and shift with cmd or ctrl where a
    // shift-click is what selects.
    const additive =
      trigger === 'click' ? event.shiftKey : event.shiftKey && (event.metaKey || event.ctrlKey);
    const inside = !!box && sameLayer(target.layer, scopes.at(-1));
    // A press selects at once, so the drag that follows moves it.
    if (!additive && !inside && !layerIn(target.layer, selection)) {
      commit([target.layer], target.scopes);
    }
    gesture = { kind: 'press', start: point, additive, target, inside };
    setHovered(null);
  };
  const onPointerMove = (event: PointerEvent) => {
    shift = event.shiftKey;
    pointer = at(event);
    if (!gesture) return updateHover();
    if (gesture.kind === 'press') {
      if (Math.hypot(pointer.x - gesture.start.x, pointer.y - gesture.start.y) <= CLICK_SLOP)
        return;
      // Dragging moves in the edit mode, and draws a selection box otherwise.
      if (gesture.inside || (trigger !== 'click' && box)) {
        gesture = { kind: 'marquee', start: gesture.start };
      } else if (trigger === 'click' && transforms) beginTransform(gesture.start, null);
      else return;
    }
    if (gesture?.kind === 'marquee') {
      box!.update(gesture.start, pointer);
      selection = marqueeLayers;
      onChange?.(selection);
      draw();
    } else updateTransform(pointer, event.shiftKey);
  };
  const onPointerUp = () => {
    const done = gesture;
    gesture = null;
    if (!done) return;
    if (done.kind === 'marquee') {
      box!.hide();
      commit(marqueeLayers);
    } else if (done.kind === 'press') {
      const { layer, scopes: inside } = done.target;
      if (!done.additive) commit([layer], inside);
      else if (layerIn(layer, selection))
        commit(selection.filter((other) => !sameLayer(other, layer)));
      else commit([...selection, layer], inside);
    } else {
      gesture = done;
      emit('end');
      gesture = null;
    }
    updateHover();
    draw();
  };
  const onDoubleClick = (event: MouseEvent) => {
    if (!selecting(event.shiftKey)) return;
    event.preventDefault();
    event.stopPropagation();
    const point = at(event);
    // In the edit mode, a double-click on a field starts typing in it, as on text in a design
    // tool. Shift-click mode leaves fields to plain clicks.
    const field = trigger === 'click' ? fieldAt(point) : null;
    if (field) {
      if (selection.length) commit([], []);
      field.focus();
      if (field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement) {
        try {
          field.setSelectionRange(field.value.length, field.value.length);
        } catch {
          // Inputs like email and number have no caret to place.
        }
      }
      return;
    }
    // One level deeper than the selection, under the pointer.
    const chain = chainAt(point);
    let depth = -1;
    chain.forEach((layer, i) => {
      if (layerIn(layer, selection)) depth = i;
    });
    if (depth >= 0 && chain[depth + 1]) commit([chain[depth + 1]], chain.slice(0, depth + 1));
  };
  const onPointerLeave = () => {
    pointer = null;
    setHovered(null);
  };
  // A press the editor takes would otherwise focus, or select text in, the component under it.
  const onMouseDown = (event: MouseEvent) => {
    if (keepFocus) {
      keepFocus = false;
      event.preventDefault();
      return;
    }
    if (!swallowClick) return;
    event.preventDefault();
    event.stopPropagation();
  };
  const onClick = (event: MouseEvent) => {
    if (!swallowClick) return;
    swallowClick = false;
    event.preventDefault();
    event.stopPropagation();
  };
  const up = () => {
    const parent = scopes.at(-1);
    if (parent) commit([parent], scopes.slice(0, -1));
  };
  const onKey = (event: KeyboardEvent) => {
    if (event.key === 'Shift') {
      shift = event.type === 'keydown';
      return updateHover();
    }
    if (event.type !== 'keydown') return;
    if (isEditable(document.activeElement)) {
      // Escape ends typing in a field the edit mode opened.
      if (event.key === 'Escape' && trigger === 'click') typingIn()?.blur();
      return;
    }
    if (event.key === 'Escape') {
      if (gesture?.kind === 'move' || gesture?.kind === 'resize') {
        emit('cancel');
        gesture = null;
      } else if (scopes.length) up();
      else if (selection.length) commit([], []);
      return;
    }
    if (!selection.length) return;
    if (event.key === 'Enter') {
      event.preventDefault();
      if (event.shiftKey) return up();
      const first = layers.childrenOf(selection[0])[0];
      if (first) commit([first], [...scopes, selection[0]]);
    } else if (event.key === 'Tab') {
      event.preventDefault();
      const scope = scopes.at(-1);
      const siblings = scope
        ? layers.childrenOf(scope)
        : canvas.getNodesIn({ x: -1e9, y: -1e9, width: 2e9, height: 2e9 }).map((node) => [node]);
      const index = siblings.findIndex((layer) => sameLayer(layer, selection[0]));
      const step = event.shiftKey ? -1 : 1;
      const next = siblings[(index + step + siblings.length) % siblings.length];
      if (next) commit([next]);
    }
  };

  surface.addEventListener('pointerdown', onPointerDown, true);
  surface.addEventListener('mousedown', onMouseDown, true);
  surface.addEventListener('click', onClick, true);
  surface.addEventListener('dblclick', onDoubleClick, true);
  surface.addEventListener('pointermove', onPointerMove);
  surface.addEventListener('pointerup', onPointerUp);
  surface.addEventListener('pointercancel', onPointerUp);
  surface.addEventListener('pointerleave', onPointerLeave);
  window.addEventListener('keydown', onKey);
  window.addEventListener('keyup', onKey);
  return {
    get: () => selection,
    set: (next) =>
      commit(
        [...next].map((layer) => [layer].flat()),
        [],
      ),
    clear: () => commit([], []),
    destroy() {
      surface.removeEventListener('pointerdown', onPointerDown, true);
      surface.removeEventListener('mousedown', onMouseDown, true);
      surface.removeEventListener('click', onClick, true);
      surface.removeEventListener('dblclick', onDoubleClick, true);
      surface.removeEventListener('pointermove', onPointerMove);
      surface.removeEventListener('pointerup', onPointerUp);
      surface.removeEventListener('pointercancel', onPointerUp);
      surface.removeEventListener('pointerleave', onPointerLeave);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKey);
      cancelAnimationFrame(frame);
      box?.remove();
      overlay.remove();
      canvas.setHover(null);
      canvas.setSelection([]);
    },
  };
}
