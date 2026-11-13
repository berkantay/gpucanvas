import '@fontsource-variable/inter';
import './styles.css';
import { useCallback, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { fitCamera, supportsGpuCanvas, type GpuCanvas as GpuCanvasInstance } from '../src/index';
import { GpuCanvas } from '../src/react';
import { flyTo, loadResults, runBench, saveResult, type BenchResult } from './bench';
import { Hints, Meter, NODE_COUNTS, Results, Toolbar } from './hud';
import { startAgents } from './agents';
import { bindMarquee } from './marquee';
import { buildPlayground, ClusterNodes } from './playground';
import { parseMode, type Stage } from './stage';

const params = new URLSearchParams(location.search);
const gpuSupported = supportsGpuCanvas();
const requested = parseMode(params.get('mode'));
const MODE = requested === 'gpu' && !gpuSupported ? 'dom' : requested;
const NODES = Number(params.get('n')) || 5_000;
/** `?hud=0` leaves only the canvas on screen, for recording footage. */
const HUD = params.get('hud') !== '0';
/** `?agents=0` turns off the cursors building screens. */
const AGENTS = Number(params.get('agents') ?? 4);
const { clusters: CLUSTERS, bounds: BOUNDS } = buildPlayground(NODES);
/** Where the bench's close-ups land: clusters of product screens, not walls of notes. */
/** Where the bench works: clusters of product screens, not walls of notes. */
const SHOWCASE = CLUSTERS.flatMap((cluster, id) =>
  cluster.items.filter((item) => item.screen).length >= 3
    ? [{ id, bounds: cluster.bounds, items: cluster.items }]
    : [],
);
/** Nodes mounted once the first `n` clusters are. */
const MOUNTED_NODES = CLUSTERS.reduce<number[]>(
  (sums, cluster) => [...sums, sums[sums.length - 1] + cluster.items.length],
  [0],
);
/**
 * Main-thread milliseconds of React work per frame while clusters mount. Every mount frame also
 * repaints the growing overview, so long frames finish far sooner than many short ones; while
 * someone pans, zooms or clicks, mounting drops to short frames so the canvas stays responsive.
 */
const MOUNT_BUDGET_MS = Number(params.get('mountBudget')) || 50;
const INTERACTIVE_MOUNT_BUDGET_MS = 6;
let lastInput = -Infinity;
/** Set once the viewer moves the camera, so the demo stops moving it for them. */
let cameraTouched = false;
for (const type of ['wheel', 'pointerdown', 'keydown'] as const) {
  window.addEventListener(
    type,
    () => {
      lastInput = performance.now();
      if (type !== 'keydown') cameraTouched = true;
    },
    { capture: true, passive: true },
  );
}

const THEME_KEY = 'gpucanvas.theme';
const readTheme = () => {
  try {
    return (params.get('theme') ?? localStorage.getItem(THEME_KEY)) === 'dark';
  } catch {
    return false;
  }
};
document.documentElement.classList.toggle('dark', readTheme());
const backgroundColor = () => getComputedStyle(document.body).backgroundColor;

declare global {
  interface Window {
    gpucanvas?: GpuCanvasInstance;
    /** The engine on screen, whichever it is. */
    stage?: Stage;
    runBench?: () => Promise<BenchResult>;
    benchResult?: BenchResult;
    mountMs?: number;
  }
}

function navigate(changes: Record<string, string>) {
  const next = new URLSearchParams(location.search);
  for (const [key, value] of Object.entries(changes)) next.set(key, value);
  location.search = next.toString();
}

/**
 * Clusters mount over several frames, as many per frame as fit the budget, so the page stays
 * responsive while thousands of components arrive.
 */
function useProgressiveMount(total: number, start: boolean) {
  const [mounted, setMounted] = useState(0);
  const [mountMs, setMountMs] = useState<number | null>(null);
  useEffect(() => {
    if (!start) return;
    let raf = 0;
    let step = 2;
    let count = 0;
    const begin = performance.now();
    const tick = () => {
      const before = performance.now();
      count = Math.min(total, count + step);
      flushSync(() => setMounted(count));
      const spent = performance.now() - before;
      const budget =
        performance.now() - lastInput < 1000 ? INTERACTIVE_MOUNT_BUDGET_MS : MOUNT_BUDGET_MS;
      step = Math.max(1, Math.min(64, Math.round(step * (budget / Math.max(1, spent)))));
      if (count < total) raf = requestAnimationFrame(tick);
      else setMountMs(performance.now() - begin);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [total, start]);
  return { mounted, mountMs };
}

function App() {
  const [canvas, setCanvas] = useState<Stage | null>(null);
  const [gpucanvas, setGpucanvas] = useState<GpuCanvasInstance | null>(null);
  const [dark, setDark] = useState(readTheme);
  const [results, setResults] = useState(loadResults);
  const [benchProgress, setBenchProgress] = useState<number | null>(null);
  const progressive = useProgressiveMount(CLUSTERS.length, gpucanvas !== null);
  const { mountMs } = progressive;
  const mountedNodes = MOUNTED_NODES[progressive.mounted];

  const bench = useCallback(async () => {
    if (!canvas || mountMs === null || benchProgress !== null) return;
    setBenchProgress(0);
    const result = await runBench(canvas, BOUNDS, SHOWCASE, mountMs, (t) => setBenchProgress(t));
    window.benchResult = result;
    console.log('[gpucanvas bench]', JSON.stringify(result));
    setResults(saveResult(result));
    setBenchProgress(null);
  }, [canvas, mountMs, benchProgress]);

  const toggleTheme = useCallback(() => {
    const next = !dark;
    document.documentElement.classList.toggle('dark', next);
    try {
      localStorage.setItem(THEME_KEY, next ? 'dark' : 'light');
    } catch {
      // The theme just won't persist.
    }
    setDark(next);
    gpucanvas?.setBackground(backgroundColor());
    gpucanvas?.invalidate();
  }, [gpucanvas, dark]);

  const fit = useCallback(() => {
    if (canvas)
      canvas.setCamera(
        fitCamera(BOUNDS, canvas.surface.clientWidth, canvas.surface.clientHeight, 96),
      );
  }, [canvas]);

  const latest = useRef({ bench, toggleTheme, fit });
  latest.current = { bench, toggleTheme, fit };
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if ((event.target as HTMLElement).closest('input, textarea, [role="listbox"]')) return;
      if (event.key === 'f') latest.current.fit();
      if (event.key === 'b') latest.current.bench();
      if (event.key === 't') latest.current.toggleTheme();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (!canvas || mountMs === null) return;
    let cancelled = false;
    const { clientWidth: w, clientHeight: h } = canvas.surface;
    const reveal =
      MODE !== 'gpu' && !cameraTouched
        ? flyTo(canvas, fitCamera(BOUNDS, w, h, 96))
        : Promise.resolve();
    reveal.then(() => {
      if (cancelled) return;
      window.mountMs = mountMs;
      if (params.has('bench')) latest.current.bench();
    });
    return () => {
      cancelled = true;
    };
  }, [canvas, mountMs]);

  useEffect(() => (canvas ? bindMarquee(canvas) : undefined), [canvas]);

  useEffect(
    () => (canvas && mountMs !== null && AGENTS > 0 ? startAgents(canvas, AGENTS) : undefined),
    [canvas, mountMs],
  );

  useEffect(() => {
    if (!canvas || mountMs === null) return;
    window.stage = canvas;
    window.runBench = () =>
      runBench(canvas, BOUNDS, SHOWCASE, mountMs).then((result) => {
        window.benchResult = result;
        setResults(saveResult(result));
        return result;
      });
  }, [canvas, mountMs]);

  return (
    <>
      <GpuCanvas
        mode={MODE === 'dom' ? 'dom' : 'gpu'}
        background={backgroundColor()}
        className="h-screen w-screen"
        onReady={(instance) => {
          window.gpucanvas = instance;
          // The GPU canvas lays nodes out at 1:1, so clusters stream in with all of them in
          // view. The DOM baseline mounts with the first cluster in view and pulls back
          // afterwards: Recharts measures its tooltip and legend with
          // getBoundingClientRect, which a far zoomed-out CSS scale skews into an endless
          // re-render.
          const { clientWidth: w, clientHeight: h } = instance.surface;
          instance.setCamera(fitCamera(MODE === 'gpu' ? BOUNDS : CLUSTERS[0].bounds, w, h, 96));
          setGpucanvas(instance);
          setCanvas(instance);
        }}
      >
        {CLUSTERS.slice(0, progressive.mounted).map((cluster, index) => (
          <ClusterNodes key={index} id={index} cluster={cluster} />
        ))}
      </GpuCanvas>
      {HUD && (
        <>
          <Toolbar
            mode={MODE}
            gpuSupported={gpuSupported}
            nodes={NODES}
            benchProgress={benchProgress}
            dark={dark}
            canBench={canvas !== null && mountMs !== null}
            onMode={(mode) => navigate({ mode })}
            onNodes={(n) => navigate({ n: String(n) })}
            onBench={bench}
            onTheme={toggleTheme}
          />
          <Meter canvas={canvas} mounted={mountedNodes} total={NODES} />
          <Results nodes={NODES} results={results} />
          <Hints />
        </>
      )}
    </>
  );
}

if (!NODE_COUNTS.includes(NODES)) console.info(`[gpucanvas] custom node count ${NODES}`);
createRoot(document.getElementById('root')!).render(<App />);
