import type { Point, Rect } from './camera';
import type { GpuCanvas } from './types';

/** Something drawn above the nodes. `remove` takes it off the canvas. */
export interface Mark {
  remove(): void;
}

export interface CursorMark extends Mark {
  /** Glides the cursor to a world point; null hides it. */
  move(point: Point | null): void;
}

type Target = Element | Point;

const SVG = 'http://www.w3.org/2000/svg';
const FONT = '500 11px/16px system-ui, sans-serif';
let instances = 0;

const pillStyle = (color: string) => ({
  position: 'absolute',
  left: '0',
  top: '0',
  font: FONT,
  padding: '0 6px',
  borderRadius: '4px',
  color: '#fff',
  background: color,
  whiteSpace: 'nowrap',
  pointerEvents: 'none',
});

/**
 * Marks above the nodes: connectors between elements, comment pins, notes that point at an
 * element (what an agent is talking about), and live cursors. They follow the camera and the
 * elements they are attached to, and stay the same size on screen at any zoom.
 */
export function createMarks(canvas: GpuCanvas, { color = '#4f8cff' } = {}) {
  const id = `gpucanvas-marks-${++instances}`;
  const root = document.createElement('div');
  Object.assign(root.style, {
    position: 'absolute',
    inset: '0',
    overflow: 'hidden',
    pointerEvents: 'none',
    zIndex: '1',
  });
  const svg = document.createElementNS(SVG, 'svg');
  Object.assign(svg.style, { position: 'absolute', inset: '0', width: '100%', height: '100%' });
  const defs = document.createElementNS(SVG, 'defs');
  svg.append(defs);
  root.append(svg);
  canvas.surface.append(root);

  /** One arrowhead marker per color. */
  const arrows = new Map<string, string>();
  const arrowFor = (stroke: string) => {
    let ref = arrows.get(stroke);
    if (!ref) {
      ref = `${id}-arrow-${arrows.size}`;
      const marker = document.createElementNS(SVG, 'marker');
      for (const [key, value] of Object.entries({
        id: ref,
        viewBox: '0 0 10 10',
        refX: '8',
        refY: '5',
        markerWidth: '7',
        markerHeight: '7',
        orient: 'auto',
      })) {
        marker.setAttribute(key, value);
      }
      const head = document.createElementNS(SVG, 'path');
      head.setAttribute('d', 'M0,1 L9,5 L0,9 z');
      head.setAttribute('fill', stroke);
      marker.append(head);
      defs.append(marker);
      arrows.set(stroke, ref);
    }
    return ref;
  };

  const toScreen = (point: Point) => canvas.worldToScreen(point);
  const screenRect = (rect: Rect): Rect => {
    const a = toScreen(rect);
    const b = toScreen({ x: rect.x + rect.width, y: rect.y + rect.height });
    return { x: a.x, y: a.y, width: b.x - a.x, height: b.y - a.y };
  };
  /** A target's world rect: an element's box, or a point as an empty rect. */
  const worldRect = (target: Target): Rect | null =>
    target instanceof Element
      ? canvas.getElementRect(target)
      : { x: target.x, y: target.y, width: 0, height: 0 };
  const place = (element: HTMLElement, x: number, y: number) => {
    const transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
    if (element.style.transform !== transform) element.style.transform = transform;
  };
  const show = (element: HTMLElement | SVGElement, visible: boolean) => {
    const display = visible ? '' : 'none';
    if (element.style.display !== display) element.style.display = display;
  };
  const div = (style: Record<string, string>, text?: string) => {
    const element = document.createElement('div');
    Object.assign(element.style, style);
    if (text) element.textContent = text;
    root.append(element);
    return element;
  };

  /** Every mark redraws itself each frame while any exist, so it follows camera and layout. */
  const marks = new Set<() => void>();
  let frame = 0;
  const loop = () => {
    frame = marks.size ? requestAnimationFrame(loop) : 0;
    for (const draw of marks) draw();
  };
  const add = (draw: () => void, remove: () => void): Mark => {
    marks.add(draw);
    if (!frame) frame = requestAnimationFrame(loop);
    return {
      remove() {
        marks.delete(draw);
        remove();
      },
    };
  };

  return {
    /** An arrow from one element (or world point) to another, with an optional label. */
    connect(
      from: Target,
      to: Target,
      options: { label?: string; color?: string; dashed?: boolean } = {},
    ): Mark {
      const stroke = options.color ?? color;
      const path = document.createElementNS(SVG, 'path');
      path.setAttribute('fill', 'none');
      path.setAttribute('stroke', stroke);
      path.setAttribute('stroke-width', '2');
      path.setAttribute('stroke-linecap', 'round');
      if (options.dashed) path.setAttribute('stroke-dasharray', '6 5');
      path.setAttribute('marker-end', `url(#${arrowFor(stroke)})`);
      svg.append(path);
      const label = options.label ? div(pillStyle(stroke), options.label) : null;
      return add(
        () => {
          const a = worldRect(from);
          const b = worldRect(to);
          show(path, !!a && !!b);
          if (label) show(label, !!a && !!b);
          if (!a || !b) return;
          const p = screenRect(a);
          const q = screenRect(b);
          // Leave from the side facing the other end, and arrive the same way.
          const dx = q.x + q.width / 2 - (p.x + p.width / 2);
          const dy = q.y + q.height / 2 - (p.y + p.height / 2);
          const across = Math.abs(dx) >= Math.abs(dy);
          const start = across
            ? { x: dx > 0 ? p.x + p.width : p.x, y: p.y + p.height / 2 }
            : { x: p.x + p.width / 2, y: dy > 0 ? p.y + p.height : p.y };
          const end = across
            ? { x: dx > 0 ? q.x - 2 : q.x + q.width + 2, y: q.y + q.height / 2 }
            : { x: q.x + q.width / 2, y: dy > 0 ? q.y - 2 : q.y + q.height + 2 };
          const bend = Math.max(
            30,
            (across ? Math.abs(end.x - start.x) : Math.abs(end.y - start.y)) / 2,
          );
          const c1 = across
            ? { x: start.x + Math.sign(dx) * bend, y: start.y }
            : { x: start.x, y: start.y + Math.sign(dy) * bend };
          const c2 = across
            ? { x: end.x - Math.sign(dx) * bend, y: end.y }
            : { x: end.x, y: end.y - Math.sign(dy) * bend };
          const d = `M${start.x.toFixed(1)},${start.y.toFixed(1)} C${c1.x.toFixed(1)},${c1.y.toFixed(1)} ${c2.x.toFixed(1)},${c2.y.toFixed(1)} ${end.x.toFixed(1)},${end.y.toFixed(1)}`;
          if (path.getAttribute('d') !== d) path.setAttribute('d', d);
          if (label) {
            // The curve's midpoint.
            const mx = (start.x + 3 * c1.x + 3 * c2.x + end.x) / 8;
            const my = (start.y + 3 * c1.y + 3 * c2.y + end.y) / 8;
            place(label, mx - label.offsetWidth / 2, my - 8);
          }
        },
        () => {
          path.remove();
          label?.remove();
        },
      );
    },

    /**
     * A comment pin at an element's top right corner, or at a world point. Its text shows on
     * hover; `onClick` makes it a button.
     */
    pin(
      target: Target,
      options: { text?: string; label?: string; color?: string; onClick?: () => void } = {},
    ): Mark {
      const fill = options.color ?? color;
      const dot = div(
        {
          position: 'absolute',
          left: '0',
          top: '0',
          width: '24px',
          height: '24px',
          borderRadius: '12px 12px 12px 2px',
          background: fill,
          border: '2px solid #fff',
          boxShadow: '0 1px 4px rgb(0 0 0 / 0.25)',
          color: '#fff',
          font: '600 11px/20px system-ui, sans-serif',
          textAlign: 'center',
          boxSizing: 'border-box',
          pointerEvents: 'auto',
          cursor: options.onClick ? 'pointer' : 'default',
        },
        options.label ?? '',
      );
      if (options.text) dot.title = options.text;
      if (options.onClick) dot.addEventListener('click', options.onClick);
      return add(
        () => {
          const rect = worldRect(target);
          show(dot, !!rect);
          if (!rect) return;
          const r = screenRect(rect);
          place(dot, r.x + r.width - 4, r.y - 20);
        },
        () => dot.remove(),
      );
    },

    /** A dashed frame around an element with a note above it: what someone is pointing at. */
    note(target: Element, text: string, options: { color?: string } = {}): Mark {
      const stroke = options.color ?? '#f59e0b';
      const frameBox = div({
        position: 'absolute',
        left: '0',
        top: '0',
        border: `2px dashed ${stroke}`,
        borderRadius: '6px',
        boxSizing: 'border-box',
      });
      const label = div({ ...pillStyle(stroke), maxWidth: '320px', whiteSpace: 'normal' }, text);
      return add(
        () => {
          const rect = worldRect(target);
          show(frameBox, !!rect);
          show(label, !!rect);
          if (!rect) return;
          const r = screenRect(rect);
          place(frameBox, r.x - 4, r.y - 4);
          const width = `${Math.round(r.width + 8)}px`;
          const height = `${Math.round(r.height + 8)}px`;
          if (frameBox.style.width !== width) frameBox.style.width = width;
          if (frameBox.style.height !== height) frameBox.style.height = height;
          place(label, r.x - 4, r.y - 8 - label.offsetHeight);
        },
        () => {
          frameBox.remove();
          label.remove();
        },
      );
    },

    /** Someone's cursor, with their name. It glides to each point given to `move`. */
    cursor(name: string, options: { color?: string } = {}): CursorMark {
      const fill = options.color ?? color;
      const box = div({ position: 'absolute', left: '0', top: '0', display: 'none' });
      box.innerHTML = `<svg width="18" height="20" viewBox="0 0 18 20" style="display:block"><path d="M1 1 L1 16 L5 12 L8 19 L11 18 L8 11 L14 11 Z" fill="${fill}" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/></svg>`;
      const tag = document.createElement('div');
      Object.assign(tag.style, pillStyle(fill), { position: 'relative', marginLeft: '12px' });
      tag.textContent = name;
      box.append(tag);
      let target: Point | null = null;
      let at: Point | null = null;
      const mark = add(
        () => {
          show(box, !!target);
          if (!target) return;
          at = at
            ? { x: at.x + (target.x - at.x) * 0.25, y: at.y + (target.y - at.y) * 0.25 }
            : target;
          const p = toScreen(at);
          place(box, p.x, p.y);
        },
        () => box.remove(),
      );
      return {
        move(point) {
          target = point;
          if (!point) at = null;
        },
        remove: mark.remove,
      };
    },

    /** Removes every mark. */
    clear() {
      for (const draw of [...marks]) marks.delete(draw);
      root.querySelectorAll(':scope > div').forEach((element) => element.remove());
      svg.querySelectorAll(':scope > path').forEach((element) => element.remove());
    },

    destroy() {
      cancelAnimationFrame(frame);
      marks.clear();
      root.remove();
    },
  };
}

export type Marks = ReturnType<typeof createMarks>;
