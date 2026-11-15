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
  type AgentView,
  type Effect,
  type GpuCanvas as GpuCanvasInstance,
  type Marks,
  type EditorOptions,
  type TransformEvent,
} from '../src/index';
import { GpuCanvas, labelComponent, pickComponents } from '../src/react';
import { finishBench, loadResults, runBench, type BenchResult } from './bench';
import { flyTo } from './fly';
import { DEMO_EFFECTS, type DemoEffect } from './effects';
import { FlagNotice, Hints, Meter, Results, Toolbar } from './hud';
import { startAgents, type Agents } from './agents';
import { buildPlayground, ClusterNodes } from './playground';
import { initial, NODE_COUNTS, reloadWith, rememberToolbar, type Pick } from './settings';
import { handleShortcut } from './shortcuts';
import { applyTheme, backgroundColor, readTheme, saveTheme } from './theme';
import { saveSnapshot, snapshotFallback } from './snapshot';
import { followFlows } from './flow';

const gpuSupported = supportsGpuCanvas();
const MODE = initial.mode === 'gpu' && !gpuSupported ? 'dom' : initial.mode;
/**
 * Phones have far less memory: thousands of live React screens get the tab killed, on the GPU path
 * and more so as plain DOM. Without the GPU path other browsers start smaller too.
 */
const PHONE =
  matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) < 600;
const NODES =
  initial.nodes ?? (PHONE ? (gpuSupported ? 1_000 : 250) : gpuSupported ? 5_000 : 1_000);
/** Agents are the cursors building screens. */
const AGENT_COUNT = 30;
/**
 * Edit: every click selects, drags move, handles resize, a double-click goes one level deeper.
 * Interact: clicks reach the components, and Shift selects.
 */
const editorOptions = (pick: Pick): EditorOptions =>
  pick === 'component' ? { pick: pickComponents, label: labelComponent } : { pick };
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
  if (!initial.agents || !first) return null;
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
const MOUNT_BUDGET_MS = initial.mountBudget ?? 50;
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

/** The whole playground in view, with room around it. */
const overview = (canvas: GpuCanvasInstance) =>
  fitCamera(BOUNDS, canvas.surface.clientWidth, canvas.surface.clientHeight, 96);

applyTheme(readTheme());

declare global {
  interface Window {
    gpucanvas?: GpuCanvasInstance;
    /** For agents and the console: read the canvas, and draw on it. */
    agentView?: AgentView;
    marks?: Marks;
    /** The engine on screen, whichever it is. */
    stage?: GpuCanvasInstance;
    runBench?: () => Promise<BenchResult>;
    benchResult?: BenchResult;
    mountMs?: number;
  }
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

/**
 * Takes a node away through a transition and brings it back, then puts back the toolbar effect
 * as it is by then.
 */
async function playTransition(
  canvas: GpuCanvasInstance,
  node: HTMLElement,
  effect: Effect,
  toolbarEffect: () => DemoEffect | null,
) {
  if (!(await animateEffect(canvas, node, effect, { duration: 900 }))) return;
  await new Promise((resolve) => setTimeout(resolve, 250));
  if (!(await animateEffect(canvas, node, effect, { from: 1, to: 0, duration: 900 }))) return;
  const toolbar = toolbarEffect();
  if (toolbar) canvas.setEffect(node, DEMO_EFFECTS[toolbar].effect);
}

function App() {
  const [canvas, setCanvas] = useState<GpuCanvasInstance | null>(null);
  const [agents, setAgents] = useState<Agents | null>(null);
  const [dark, setDark] = useState(readTheme);
  const [results, setResults] = useState(loadResults);
  const [benchProgress, setBenchProgress] = useState<number | null>(null);
  const [effect, setEffect] = useState(initial.effect);
  const [edit, setEdit] = useState(initial.edit);
  const [pick, setPick] = useState(initial.pick);
  const [agentsOn, setAgentsOn] = useState(initial.agents);
  const progressive = useProgressiveMount(CLUSTERS.length, canvas !== null);
  const { mountMs } = progressive;
  const mountedNodes = MOUNTED_NODES[progressive.mounted];
  const effectRef = useRef(effect);
  effectRef.current = effect;

  const bench = useCallback(async () => {
    if (!canvas || mountMs === null || benchProgress !== null) return;
    setBenchProgress(0);
    const ranWith = effectRef.current;
    const result = await runBench(canvas, BOUNDS, SHOWCASE, mountMs, (t) => setBenchProgress(t));
    setResults(finishBench(result, ranWith));
    setBenchProgress(null);
  }, [canvas, mountMs, benchProgress]);

  const toggleTheme = useCallback(() => {
    const next = !dark;
    saveTheme(next);
    setDark(next);
    canvas?.setBackground(backgroundColor());
    canvas?.invalidate();
  }, [canvas, dark]);

  const fit = useCallback(() => {
    if (canvas) canvas.setCamera(overview(canvas));
  }, [canvas]);

  const latest = useRef({ bench, toggleTheme, fit });
  latest.current = { bench, toggleTheme, fit };
  useEffect(() => {
    const onKey = (event: KeyboardEvent) =>
      handleShortcut(event, {
        fit: () => latest.current.fit(),
        bench: () => latest.current.bench(),
        theme: () => latest.current.toggleTheme(),
      });
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
    const target = overview(canvas);
    // Once the intro's screens are built, the camera pulls out to everything.
    const pullOut = INTRO || MODE !== 'gpu';
    const reveal = (agents?.introDone ?? Promise.resolve()).then(() => {
      if (cancelled) return;
      agents?.release();
      if (pullOut && !cameraTouched) return flyTo(canvas, target, 2400);
    });
    reveal.then(() => {
      if (cancelled) return;
      revealed.current = true;
      window.mountMs = mountMs;
      if (initial.bench) latest.current.bench();
    });
    return () => {
      cancelled = true;
    };
  }, [canvas, mountMs, agents, agentsOn]);

  useEffect(() => {
    rememberToolbar({ effect, edit, pick, agents: agentsOn });
  }, [effect, edit, pick, agentsOn]);

  // Every component wears the effect once all have mounted.
  useEffect(() => {
    if (!canvas || mountMs === null) return;
    const all = canvas.getNodesIn({ x: -1e9, y: -1e9, width: 2e9, height: 2e9 });
    const shader = effect ? DEMO_EFFECTS[effect].effect : null;
    for (const node of all) canvas.setEffect(node, shader);
  }, [canvas, mountMs, effect]);

  useEffect(() => {
    if (!canvas) return;
    const editor = bindEditor(canvas, {
      ...editorOptions(pick),
      trigger: edit ? 'click' : 'shift-click',
      onTransform: edit ? (event) => applyTransform(canvas, event) : undefined,
    });
    const onSelected = (run: (node: HTMLElement) => void) => () => {
      const first = editor.get()[0]?.[0];
      const node = first && canvas.getNodeOf(first);
      if (node) run(node);
    };
    const toolbarEffect = () => effectRef.current;
    const onKey = (event: KeyboardEvent) =>
      handleShortcut(event, {
        snapshot: onSelected((node) => saveSnapshot(canvas, node)),
        dissolve: onSelected((node) =>
          playTransition(canvas, node, effects.dissolve, toolbarEffect),
        ),
        wipe: onSelected((node) => playTransition(canvas, node, effects.wipe, toolbarEffect)),
      });
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      editor.destroy();
    };
  }, [canvas, edit, pick]);

  useEffect(() => {
    if (canvas) return followFlows(canvas);
  }, [canvas]);

  useEffect(() => {
    if (!canvas || mountMs === null) return;
    window.stage = canvas;
    window.runBench = async () => {
      const ranWith = effectRef.current;
      const result = await runBench(canvas, BOUNDS, SHOWCASE, mountMs);
      setResults(finishBench(result, ranWith));
      return result;
    };
  }, [canvas, mountMs]);

  return (
    <>
      <GpuCanvas
        mode={MODE}
        background={backgroundColor()}
        snapshotFallback={snapshotFallback}
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
          setCanvas(instance);
        }}
      >
        {CLUSTERS.slice(0, progressive.mounted).map((cluster, index) => (
          <ClusterNodes key={index} id={index} cluster={cluster} blank={INTRO} />
        ))}
      </GpuCanvas>
      {initial.hud && (
        <>
          <Toolbar
            mode={MODE}
            gpuSupported={gpuSupported}
            nodes={NODES}
            benchProgress={benchProgress}
            dark={dark}
            canBench={canvas !== null && mountMs !== null}
            onMode={(mode) => reloadWith({ mode })}
            onNodes={(n) => reloadWith({ n })}
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
