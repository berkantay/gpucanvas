import type { Rect } from './camera';
import type { Guide } from './snap';

/** Resize handles, by the edges they move. */
export const HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as const;
export type Handle = (typeof HANDLES)[number];

const HANDLE_PX = 8;
const CURSORS: Record<Handle, string> = {
  nw: 'nwse-resize',
  se: 'nwse-resize',
  ne: 'nesw-resize',
  sw: 'nesw-resize',
  n: 'ns-resize',
  s: 'ns-resize',
  e: 'ew-resize',
  w: 'ew-resize',
};

/** What the overlay shows this frame, in surface pixels. */
export interface OverlayState {
  hover: { rect: Rect; name: string | null } | null;
  /** `size` is in world units: what the selection measures, at any zoom. */
  selection: { rect: Rect; size: Rect; name: string | null; count: number } | null;
  /** A frame around a selection of several layers. */
  bounds: boolean;
  handles: boolean;
  guides: Rect[];
}

const pill = (color: string) => ({
  position: 'absolute',
  font: '500 11px/16px system-ui, sans-serif',
  padding: '0 5px',
  borderRadius: '3px',
  color: '#fff',
  background: color,
  whiteSpace: 'nowrap',
  pointerEvents: 'none',
});

/**
 * The editor's chrome above the canvas: names and sizes, a frame and handles around the
 * selection, and snapping guides. Outlines themselves are drawn by the canvas.
 */
export function createOverlay(surface: HTMLElement, color: string, hoverColor: string) {
  const root = document.createElement('div');
  Object.assign(root.style, {
    position: 'absolute',
    inset: '0',
    overflow: 'hidden',
    pointerEvents: 'none',
    zIndex: '2',
  });
  const make = (style: Record<string, string>) => {
    const element = document.createElement('div');
    Object.assign(element.style, { left: '0', top: '0' }, style, { display: 'none' });
    root.append(element);
    return element;
  };
  const hoverName = make(pill(hoverColor));
  const name = make(pill(color));
  const size = make(pill(color));
  const bounds = make({ position: 'absolute', border: `1px solid ${color}` });
  const handles = HANDLES.map((handle) => {
    const element = make({
      position: 'absolute',
      width: `${HANDLE_PX}px`,
      height: `${HANDLE_PX}px`,
      boxSizing: 'border-box',
      background: '#fff',
      border: `1px solid ${color}`,
      pointerEvents: 'auto',
      cursor: CURSORS[handle],
    });
    element.dataset.gpucanvasHandle = handle;
    return element;
  });
  const guides: HTMLElement[] = [];
  surface.append(root);

  const show = (element: HTMLElement, visible: boolean) => {
    element.style.display = visible ? 'block' : 'none';
  };
  const place = (element: HTMLElement, x: number, y: number) => {
    element.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
  };
  const text = (element: HTMLElement, value: string) => {
    if (element.textContent !== value) element.textContent = value;
  };

  return {
    render(state: OverlayState) {
      const { hover, selection } = state;
      show(hoverName, !!hover?.name);
      if (hover?.name) {
        text(hoverName, hover.name);
        place(hoverName, hover.rect.x - 1, hover.rect.y - 19);
      }
      show(name, !!selection?.name);
      show(size, !!selection);
      show(bounds, !!selection && state.bounds);
      for (const handle of handles) show(handle, !!selection && state.handles);
      if (selection) {
        const { rect } = selection;
        if (selection.name) {
          text(name, selection.name);
          place(name, rect.x - 1, rect.y - 19);
        }
        const { width, height } = selection.size;
        const label = `${Math.round(width)} × ${Math.round(height)}`;
        text(size, selection.count > 1 ? `${selection.count} layers · ${label}` : label);
        // Centered under the selection; its width is known once it has text.
        place(size, rect.x + rect.width / 2 - size.offsetWidth / 2, rect.y + rect.height + 6);
        if (state.bounds) {
          place(bounds, rect.x, rect.y);
          bounds.style.width = `${rect.width}px`;
          bounds.style.height = `${rect.height}px`;
        }
        if (state.handles) {
          HANDLES.forEach((handle, i) => {
            const fx = handle.includes('w') ? 0 : handle.includes('e') ? 1 : 0.5;
            const fy = handle.includes('n') ? 0 : handle.includes('s') ? 1 : 0.5;
            place(
              handles[i],
              rect.x + rect.width * fx - HANDLE_PX / 2,
              rect.y + rect.height * fy - HANDLE_PX / 2,
            );
          });
        }
      }
      // Guides are lines in surface pixels: rects one pixel thick.
      while (guides.length < state.guides.length) {
        guides.push(make({ position: 'absolute', background: '#f43f5e' }));
      }
      guides.forEach((line, i) => {
        const guide = state.guides[i];
        show(line, !!guide);
        if (!guide) return;
        place(line, guide.x, guide.y);
        line.style.width = `${Math.max(1, guide.width)}px`;
        line.style.height = `${Math.max(1, guide.height)}px`;
      });
    },
    remove() {
      root.remove();
    },
  };
}

/** A world guide as a one-pixel rect in surface pixels. */
export const guideRect = (
  guide: Guide,
  toScreen: (x: number, y: number) => { x: number; y: number },
): Rect => {
  const a = toScreen(guide.x1, guide.y1);
  const b = toScreen(guide.x2, guide.y2);
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(b.x - a.x),
    height: Math.abs(b.y - a.y),
  };
};
