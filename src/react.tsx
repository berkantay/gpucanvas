import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import {
  bindSelection,
  createGpuCanvas,
  type GpuCanvas as GpuCanvasInstance,
  type GpuCanvasOptions,
  type Selection,
  type SelectionOptions,
} from './index';

const CanvasContext = createContext<GpuCanvasInstance | null>(null);

export interface GpuCanvasProps extends GpuCanvasOptions {
  children?: ReactNode;
  className?: string;
  style?: CSSProperties;
  onReady?: (canvas: GpuCanvasInstance) => void;
}

/** An infinite canvas. Children are `<CanvasNode>`s; they mount once the canvas is ready. */
export function GpuCanvas({ children, className, style, onReady, ...options }: GpuCanvasProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [canvas, setCanvas] = useState<GpuCanvasInstance | null>(null);
  const latest = useRef({ options, onReady });
  latest.current = { options, onReady };

  useEffect(() => {
    let disposed = false;
    let created: GpuCanvasInstance | null = null;
    createGpuCanvas(hostRef.current!, latest.current.options).then((instance) => {
      if (disposed) return instance.destroy();
      created = instance;
      setCanvas(instance);
      latest.current.onReady?.(instance);
    });
    return () => {
      disposed = true;
      created?.destroy();
      setCanvas(null);
    };
    // The mode and GPU resources are fixed for the canvas's lifetime; remount to change them.
  }, []);

  return (
    <div ref={hostRef} className={className} style={{ position: 'relative', ...style }}>
      <CanvasContext.Provider value={canvas}>{canvas && children}</CanvasContext.Provider>
    </div>
  );
}

export interface CanvasNodeProps {
  x: number;
  y: number;
  width: number;
  height: number;
  children?: ReactNode;
  className?: string;
  style?: CSSProperties;
}

/** A live DOM node placed on the canvas in world units. Events, focus and state work as usual. */
export function CanvasNode({ x, y, width, height, children, className, style }: CanvasNodeProps) {
  const canvas = useContext(CanvasContext);
  if (!canvas) throw new Error('<CanvasNode> must be inside <GpuCanvas>');
  const [element] = useState(() => document.createElement('div'));

  useLayoutEffect(() => {
    canvas.addNode(element, { x, y, width, height });
    return () => canvas.removeNode(element);
    // Position changes go through updateNode below without remounting.
  }, [canvas, element]);

  const mounted = useRef(false);
  useLayoutEffect(() => {
    if (mounted.current) canvas.updateNode(element, { x, y, width, height });
    mounted.current = true;
  }, [canvas, element, x, y, width, height]);

  useLayoutEffect(() => {
    element.className = className ?? '';
  }, [element, className]);

  return createPortal(
    <div style={{ width: '100%', height: '100%', ...style }}>{children}</div>,
    element,
  );
}

export const useGpuCanvas = () => useContext(CanvasContext);

/**
 * Click, hover and box selection on the canvas around it (see `bindSelection`), as React state.
 * Use it inside `<GpuCanvas>`; `onChange` lifts the selection out.
 */
export function useSelection(options: SelectionOptions = {}) {
  const canvas = useGpuCanvas();
  const [selected, setSelected] = useState<Element[]>([]);
  const selection = useRef<Selection | null>(null);
  const latest = useRef(options);
  latest.current = options;
  // A new pick function each render is the same pick: read the latest one when a click lands.
  const pick = typeof options.pick === 'function' ? 'function' : (options.pick ?? 'node');
  const { trigger, hover, marquee } = options;

  useEffect(() => {
    if (!canvas) return;
    const bound = bindSelection(canvas, {
      pick:
        pick === 'function'
          ? (element, at) =>
              (latest.current.pick as Exclude<SelectionOptions['pick'], string>)!(element, at)
          : pick,
      trigger,
      hover,
      marquee,
      onChange(next) {
        setSelected(next);
        latest.current.onChange?.(next);
      },
    });
    selection.current = bound;
    return () => {
      bound.destroy();
      selection.current = null;
      setSelected([]);
    };
  }, [canvas, pick, trigger, hover, marquee]);

  return {
    selected,
    set: (elements: Iterable<Element>) => selection.current?.set(elements),
    clear: () => selection.current?.clear(),
  };
}

export interface ComponentInfo {
  /** The component's display name. Production builds usually minify it. */
  name: string;
  /** The DOM elements it renders at its top level: one, or several for a fragment. */
  elements: Element[];
}

interface Fiber {
  tag: number;
  type: unknown;
  stateNode: unknown;
  return: Fiber | null;
  child: Fiber | null;
  sibling: Fiber | null;
}

// React's fiber tags for components: function, class, forwardRef, memo.
const COMPONENT_TAGS = new Set([0, 1, 11, 15]);
const PORTAL_TAG = 4;

const fiberOf = (element: Element): Fiber | null => {
  const key = Object.keys(element).find((name) => name.startsWith('__reactFiber$'));
  return key ? (element as unknown as Record<string, Fiber>)[key] : null;
};

const nameOf = (type: unknown): string => {
  const t = type as {
    displayName?: string;
    name?: string;
    render?: { displayName?: string; name?: string };
  };
  return t.displayName || t.name || t.render?.displayName || t.render?.name || 'Anonymous';
};

const topElements = (fiber: Fiber, out: Element[] = []) => {
  for (let child = fiber.child; child; child = child.sibling) {
    if (child.stateNode instanceof Element) out.push(child.stateNode);
    else if (child.tag !== PORTAL_TAG) topElements(child, out);
  }
  return out;
};

/**
 * The React components that rendered `element`, nearest first, up to the portal into its node
 * (`<CanvasNode>` renders one). It reads React's internal fibers, as click-to-component tools do,
 * so it can break with a React release.
 */
export function componentsOf(element: Element): ComponentInfo[] {
  const found: ComponentInfo[] = [];
  for (let fiber = fiberOf(element); fiber; fiber = fiber.return) {
    // Node content reaches its node through a portal; above it is the app around the canvas.
    if (fiber.tag === PORTAL_TAG) break;
    if (!COMPONENT_TAGS.has(fiber.tag)) continue;
    const elements = topElements(fiber);
    if (elements.length) found.push({ name: nameOf(fiber.type), elements });
  }
  return found;
}

/** The nearest React component that rendered `element`, or null. */
export const componentOf = (element: Element): ComponentInfo | null =>
  componentsOf(element)[0] ?? null;
