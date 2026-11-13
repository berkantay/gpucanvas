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
  bindEditor,
  createGpuCanvas,
  type Editor,
  type EditorOptions,
  type EditorPick,
  type GpuCanvas as GpuCanvasInstance,
  type GpuCanvasOptions,
  type Layer,
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
 * The editor (`bindEditor`) on the canvas around it, with its selection as React state. Use it
 * inside `<GpuCanvas>`; `onChange` lifts the selection out.
 */
export function useEditor(options: EditorOptions = {}) {
  const canvas = useGpuCanvas();
  const [selected, setSelected] = useState<Layer[]>([]);
  const editor = useRef<Editor | null>(null);
  const latest = useRef(options);
  latest.current = options;
  // Functions are read when they are called, so a new one each render does not rebind.
  const pick = typeof options.pick === 'function' ? 'function' : (options.pick ?? 'node');
  const transforms = !!options.onTransform;
  const { trigger, hover, marquee, labels, snap, color } = options;

  useEffect(() => {
    if (!canvas) return;
    const bound = bindEditor(canvas, {
      pick:
        pick === 'function'
          ? (element, at) => (latest.current.pick as PickFunction)(element, at)
          : pick,
      trigger,
      hover,
      marquee,
      labels,
      snap,
      color,
      label: (layer) =>
        latest.current.label ? latest.current.label(layer) : defaultLabel(canvas, layer),
      onChange(next) {
        setSelected(next);
        latest.current.onChange?.(next);
      },
      onTransform: transforms ? (event) => latest.current.onTransform?.(event) : undefined,
    });
    editor.current = bound;
    return () => {
      bound.destroy();
      editor.current = null;
      setSelected([]);
    };
  }, [canvas, pick, trigger, hover, marquee, labels, snap, color, transforms]);

  return {
    selected,
    set: (layers: Iterable<Element | Element[]>) => editor.current?.set(layers),
    clear: () => editor.current?.clear(),
  };
}

type PickFunction = Extract<EditorPick, (...args: never[]) => unknown>;

/** The editor's own label: the tag name inside nodes, nothing for nodes. */
const defaultLabel = (canvas: GpuCanvasInstance, layer: Layer) =>
  canvas.getNodeOf(layer[0]) === layer[0] ? null : layer[0].localName;

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

/**
 * A pick for `bindEditor` and `useEditor` that selects React components: a click lands on the
 * outermost component in the node, and each double-click goes one component deeper.
 */
export const pickComponents = (element: Element): Element[][] =>
  componentsOf(element)
    .reverse()
    .map((component) => component.elements);

/** A label for components: the name of the outermost component a layer is the top of. */
export const labelComponent = (layer: Layer): string | null =>
  componentsOf(layer[0])
    .filter((component) => component.elements[0] === layer[0])
    .at(-1)?.name ?? null;
