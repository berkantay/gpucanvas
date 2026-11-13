import '@fontsource-variable/inter';
import './styles.css';
import { useCallback, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import {
  animateEffect,
  bindEditor,
  createAgentView,
  createMarks,
  effects,
  fitCamera,
  supportsGpuCanvas,
  toBlob,
  type AgentView,
  type Effect,
  type GpuCanvas as GpuCanvasInstance,
  type Marks,
  type EditorOptions,
  type TransformEvent,
} from '../src/index';
import { GpuCanvas, labelComponent, pickComponents } from '../src/react';
import { flyTo, loadResults, runBench, saveResult, type BenchResult } from './bench';
import { DEMO_EFFECTS, parseEffect } from './effects';
import {
  FlagNotice,
  Hints,
  Meter,
  NODE_COUNTS,
  parsePick,
  Results,
  Toolbar,
  type Pick,
} from './hud';
import { startAgents, type Agents } from './agents';
import { buildPlayground, ClusterNodes } from './playground';
import { parseMode, type Stage } from './stage';

const params = new URLSearchParams(location.search);
const gpuSupported = supportsGpuCanvas();
const requested = parseMode(params.get('mode'));
const MODE = requested === 'gpu' && !gpuSupported ? 'dom' : requested;
/** Without the GPU path the DOM fallback starts smaller, so phones and other browsers keep up. */
const NODES = Number(params.get('n')) || (gpuSupported ? 5_000 : 1_000);
/** `?hud=0` leaves only the canvas on screen, for recording footage. */
const HUD = params.get('hud') !== '0';
/**
 * The toolbar owns the remaining settings; the URL only remembers them across reloads. Agents are
 * the cursors building screens.
 */
const AGENT_COUNT = 30;
const INITIAL_AGENTS = params.get('agents') !== '0';
/**
 * Edit: every click selects, drags move, handles resize, a double-click goes one level deeper.
 * Interact: clicks reach the components, and Shift selects.
 */
const INITIAL_EDIT = params.get('edit') !== '0';
const INITIAL_PICK = parsePick(params.get('pick'));
const editorOptions = (pick: Pick): EditorOptions =>
  pick === 'component' ? { pick: pickComponents, label: labelComponent } : { pick };
/** `?effect=glow` (or hue, blur, ripple, pixelate, grayscale): a shader on every component. */
const INITIAL_EFFECT = parseEffect(params.get('effect'));
const { clusters: CLUSTERS, bounds: BOUNDS } = buildPlayground(NODES);
/** Where the bench works: clusters of product screens, not walls of notes. */
const SHOWCASE = CLUSTERS.flatMap((cluster, id) =>
  cluster.items.filter((item) => item.screen).length >= 3
    ? [{ id, bounds: cluster.bounds, items: cluster.items }]
    : [],
);
/** How close the intro starts: near enough to watch screens being built, far enough for dozens. */
const INTRO_ZOOM = 0.16;
/**
 * The canvas opens on this view, around the first product cluster, with its screens blank; the
 * agents build them first.
 */
const INTRO = (() => {
  const first = SHOWCASE[0]?.bounds;
  if (!INITIAL_AGENTS || !first) return null;
  const width = innerWidth / INTRO_ZOOM;
  const height = innerHeight / INTRO_ZOOM;
  return {
    x: first.x + first.width / 2 - width / 2,
    y: first.y + first.height / 2 - height / 2,
    width,
    height,
  };
})();
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
    /** For agents and the console: read the canvas, and draw on it. */
    agentView?: AgentView;
    marks?: Marks;
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

/**
 * The demo applies moves and resizes straight to the DOM: nodes through `updateNode`, elements
 * inside them through their own style. A real editor would write its document instead.
 */
function applyTransform(canvas: GpuCanvasInstance, event: TransformEvent) {
  event.layers.forEach((layer, i) => {
    const element = layer[0] as HTMLElement;
    const from = event.from[i];
    const to = event.to[i];
    if (canvas.getNodeOf(element) === element) return canvas.updateNode(element, to);
    if (event.phase === 'start') element.dataset.translate = element.style.translate;
    const [x = 0, y = 0] = (element.dataset.translate ?? '')
      .split(' ')
      .map((v) => parseFloat(v) || 0);
    element.style.translate = `${x + to.x - from.x}px ${y + to.y - from.y}px`;
    if (event.kind === 'resize') {
      element.style.width = `${to.width}px`;
      element.style.height = `${to.height}px`;
    }
  });
}

const isTyping = () =>
  document.activeElement instanceof HTMLInputElement ||
  document.activeElement instanceof HTMLTextAreaElement ||
  (document.activeElement as HTMLElement | null)?.isContentEditable === true;

/** Takes a node away through a transition and brings it back, then restores the toolbar effect. */
async function playTransition(canvas: GpuCanvasInstance, node: HTMLElement, effect: Effect) {
  if (!(await animateEffect(canvas, node, effect, { duration: 900 }))) return;
  await new Promise((resolve) => setTimeout(resolve, 250));
  if (!(await animateEffect(canvas, node, effect, { from: 1, to: 0, duration: 900 }))) return;
  const toolbar = parseEffect(new URLSearchParams(location.search).get('effect'));
  if (toolbar) canvas.setEffect(node, DEMO_EFFECTS[toolbar].effect);
}

async function saveSnapshot(canvas: GpuCanvasInstance, node: HTMLElement) {
  const image = await canvas.snapshot(node, { scale: 2 }).catch(() => null);
  if (!image) return;
  const link = document.createElement('a');
  link.href = URL.createObjectURL(await toBlob(image));
  link.download = 'screen.png';
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

function App() {
  const [canvas, setCanvas] = useState<Stage | null>(null);
  const [agents, setAgents] = useState<Agents | null>(null);
  const [gpucanvas, setGpucanvas] = useState<GpuCanvasInstance | null>(null);
  const [dark, setDark] = useState(readTheme);
  const [results, setResults] = useState(loadResults);
  const [benchProgress, setBenchProgress] = useState<number | null>(null);
  const [effect, setEffect] = useState(INITIAL_EFFECT);
  const [edit, setEdit] = useState(INITIAL_EDIT);
  const [pick, setPick] = useState(INITIAL_PICK);
  const [agentsOn, setAgentsOn] = useState(INITIAL_AGENTS);
  const progressive = useProgressiveMount(CLUSTERS.length, gpucanvas !== null);
  const { mountMs } = progressive;
  const mountedNodes = MOUNTED_NODES[progressive.mounted];

  const bench = useCallback(async () => {
    if (!canvas || mountMs === null || benchProgress !== null) return;
    setBenchProgress(0);
    const result = await runBench(canvas, BOUNDS, SHOWCASE, mountMs, (t) => setBenchProgress(t));
    if (effect) result.effect = effect;
    window.benchResult = result;
    console.log('[gpucanvas bench]', JSON.stringify(result));
    setResults(saveResult(result));
    setBenchProgress(null);
  }, [canvas, mountMs, benchProgress, effect]);

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

  const effectRef = useRef(effect);
  effectRef.current = effect;
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

  // The intro plays once; agents switched back on later just work on the canvas.
  const intro = useRef(INTRO);
  useEffect(() => {
    if (!canvas || !agentsOn) return;
    const started = startAgents(canvas, AGENT_COUNT, intro.current);
    intro.current = null;
    setAgents(started);
    return () => {
      started.release();
      started.stop();
      setAgents(null);
    };
  }, [canvas, agentsOn]);

  const revealed = useRef(false);
  useEffect(() => {
    if (revealed.current || !canvas || mountMs === null || (agentsOn && !agents)) return;
    let cancelled = false;
    const { clientWidth: w, clientHeight: h } = canvas.surface;
    // Once the intro's screens are built, the camera pulls out to everything.
    const pullOut = INTRO || MODE !== 'gpu';
    const reveal = (agents?.introDone ?? Promise.resolve()).then(() => {
      if (cancelled) return;
      agents?.release();
      if (pullOut && !cameraTouched) return flyTo(canvas, fitCamera(BOUNDS, w, h, 96), 2400);
    });
    reveal.then(() => {
      if (cancelled) return;
      revealed.current = true;
      window.mountMs = mountMs;
      if (params.has('bench')) latest.current.bench();
    });
    return () => {
      cancelled = true;
    };
  }, [canvas, mountMs, agents, agentsOn]);

  // The URL keeps the toolbar settings across reloads and mode switches.
  useEffect(() => {
    const next = new URLSearchParams(location.search);
    const set = (key: string, value: string | null) =>
      value === null ? next.delete(key) : next.set(key, value);
    set('effect', effect);
    set('edit', edit ? null : '0');
    set('pick', pick === 'component' ? null : pick);
    set('agents', agentsOn ? null : '0');
    history.replaceState(null, '', `?${next}`);
  }, [effect, edit, pick, agentsOn]);

  // Every component wears the effect once all have mounted.
  useEffect(() => {
    if (!gpucanvas || mountMs === null) return;
    const all = gpucanvas.getNodesIn({ x: -1e9, y: -1e9, width: 2e9, height: 2e9 });
    const shader = effect ? DEMO_EFFECTS[effect].effect : null;
    for (const node of all) gpucanvas.setEffect(node, shader);
  }, [gpucanvas, mountMs, effect]);

  useEffect(() => {
    if (!gpucanvas) return;
    const editor = bindEditor(gpucanvas, {
      ...editorOptions(pick),
      trigger: edit ? 'click' : 'shift-click',
      onTransform: edit ? (event) => applyTransform(gpucanvas, event) : undefined,
    });
    // S saves the selected screen as a PNG. D dissolves it out and back in, W wipes it.
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || isTyping()) return;
      const first = editor.get()[0]?.[0];
      const node = first && gpucanvas.getNodeOf(first);
      if (!node) return;
      if (event.key === 's') saveSnapshot(gpucanvas, node);
      if (event.key === 'd') playTransition(gpucanvas, node, effects.dissolve);
      if (event.key === 'w') playTransition(gpucanvas, node, effects.wipe);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      editor.destroy();
    };
  }, [gpucanvas, edit, pick]);

  useEffect(() => {
    if (!canvas || mountMs === null) return;
    window.stage = canvas;
    window.runBench = () =>
      runBench(canvas, BOUNDS, SHOWCASE, mountMs).then((result) => {
        if (effectRef.current) result.effect = effectRef.current;
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
          window.agentView = createAgentView(instance);
          window.marks = createMarks(instance);
          // The GPU canvas lays nodes out at 1:1, so clusters stream in with all of them in
          // view. The DOM baseline mounts with the first cluster in view and pulls back
          // afterwards: Recharts measures its tooltip and legend with
          // getBoundingClientRect, which a far zoomed-out CSS scale skews into an endless
          // re-render.
          const { clientWidth: w, clientHeight: h } = instance.surface;
          instance.setCamera(
            INTRO
              ? fitCamera(INTRO, w, h, 0)
              : fitCamera(MODE === 'gpu' ? BOUNDS : CLUSTERS[0].bounds, w, h, 96),
          );
          setGpucanvas(instance);
          setCanvas(instance);
        }}
      >
        {CLUSTERS.slice(0, progressive.mounted).map((cluster, index) => (
          <ClusterNodes key={index} id={index} cluster={cluster} blank={INTRO} />
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
            effect={effect}
            onEffect={setEffect}
            edit={edit}
            pick={pick}
            agents={agentsOn}
            onEdit={setEdit}
            onPick={setPick}
            onAgents={setAgentsOn}
            onBench={bench}
            onTheme={toggleTheme}
          />
          <Meter canvas={canvas} mounted={mountedNodes} total={NODES} />
          <Results nodes={NODES} effect={effect} results={results} />
          <Hints edit={edit} />
          {!gpuSupported && <FlagNotice />}
        </>
      )}
    </>
  );
}

if (!NODE_COUNTS.includes(NODES)) console.info(`[gpucanvas] custom node count ${NODES}`);
createRoot(document.getElementById('root')!).render(<App />);
