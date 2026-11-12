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
  createGpuCanvas,
  type GpuCanvas as GpuCanvasInstance,
  type GpuCanvasOptions,
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
