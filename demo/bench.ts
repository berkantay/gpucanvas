import { fitCamera, type Camera, type Rect } from '../src/index';
import { createMarquee } from './marquee';
import type { Mode, Stage } from './stage';

export interface BenchResult {
  mode: Mode;
  nodes: number;
  frames: number;
  avgFps: number;
  p50Ms: number;
  p95Ms: number;
  /** Share of frames that took longer than 20 ms, in percent. */
  jankPercent: number;
  /** Milliseconds from the first cluster to the last one mounted. */
  mountMs: number;
  at: number;
  /** What the session did and when, in ms from its start, with the screen point of each action. */
  log?: BenchEvent[];
}

export interface BenchEvent {
  t: number;
  kind: 'click' | 'type' | 'move' | 'select';
  x: number;
  y: number;
  text?: string;
}

/** A cluster as the bench needs it: its bounds, its items' rects and its index in the playground. */
export interface BenchCluster {
  id: number;
  bounds: Rect;
  items: { rect: Rect; name?: string }[];
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const lerpCamera = (a: Camera, b: Camera, t: number): Camera => ({
  x: lerp(a.x, b.x, t),
  y: lerp(a.y, b.y, t),
  zoom: Math.exp(lerp(Math.log(a.zoom), Math.log(b.zoom), t)),
});
const centeredOn = (x: number, y: number, zoom: number, w: number, h: number): Camera => ({
  x: x - w / zoom / 2,
  y: y - h / zoom / 2,
  zoom,
});
const center = (rect: Rect) => ({ x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 });
const distance = (a: Rect, b: Rect) => {
  const p = center(a);
  const q = center(b);
  return Math.hypot(p.x - q.x, p.y - q.y);
};

/** The canvas node that holds item `index` of cluster `id`, in either engine. */
export const nodeClass = (id: number, index: number) => `node-${id}-${index}`;

/**
 * Steps of the bench session. A step eases the camera to `to` over `ms` (or holds when `to` is
 * absent) and runs `act` as it starts; `type` types its text across the step.
 */
interface Step {
  ms: number;
  to?: Camera;
  /** What the move is, logged when it starts: dive, overview, climb, across, screen, push. */
  move?: string;
  act?: () => BenchEvent | null;
  type?: { input: HTMLInputElement; text: string; at: () => { x: number; y: number } };
  /** Runs every frame of the step with its eased progress, 0 to 1. */
  each?: (t: number) => void;
}

const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;

/** One place the session visits: a screen in a far part of the canvas, and what happens there. */
interface Stop {
  /** Where on the canvas, as a fraction of its width and height. */
  at: [number, number];
  screen: RegExp;
  /** How close to get: the screen fills the view up to this zoom. */
  zoom: number;
  /** How the camera gets there: straight in, across at altitude, or out to everything first. */
  route: 'dive' | 'across' | 'overview';
  actions: (Action | Typing | Wait)[];
}
/** A click on the control whose label, accessible name or `data-act` starts with `press`. */
interface Action {
  press: string;
  times?: number;
}
/** Typing `text` into the input whose placeholder starts with `into`. */
interface Typing {
  into: string;
  text: string;
}
/** A pause to watch what the last action set off. */
interface Wait {
  wait: number;
}

/**
 * The tour, at the pace a person works, from one edge of the canvas to the other: each stop is
 * a screen worth reading and something done on it.
 */
const TOUR: Stop[] = [
  {
    at: [0.15, 0.2],
    screen: /^\w+ \/ Web \/ Messages$/,
    zoom: 1.1,
    route: 'dive',
    actions: [
      { into: 'Message', text: 'Can we ship the redesign Friday?' },
      { press: 'Send' },
      { wait: 1400 },
    ],
  },
  {
    at: [0.85, 0.15],
    screen: /^\w+ \/ Web \/ Calendar$/,
    zoom: 1.1,
    route: 'across',
    actions: [{ press: 'New event' }, { press: 'New event' }, { press: 'New event' }],
  },
  {
    at: [0.85, 0.75],
    screen: /^\w+ \/ Web \/ Dashboard$/,
    zoom: 1.1,
    route: 'across',
    actions: [{ press: '12 months' }, { wait: 600 }, { press: '7 days' }, { wait: 600 }],
  },
  {
    at: [0.15, 0.8],
    screen: /^\w+ \/ Web \/ Board$/,
    zoom: 1.1,
    route: 'overview',
    actions: [
      { press: 'card 0-0' },
      { press: 'card 0-0' },
      { press: 'card 0-0' },
      { press: 'card 1-0' },
      { press: 'Add card' },
    ],
  },
  {
    at: [0.5, 0.45],
    screen: /^\w+ \/ iOS \/ Player$/,
    zoom: 2,
    route: 'across',
    actions: [{ press: 'Play' }, { wait: 1200 }, { press: 'Next track' }, { press: 'Like' }],
  },
  {
    at: [0.35, 0.1],
    screen: /^\w+ \/ iOS \/ Notifications$/,
    zoom: 2,
    route: 'across',
    actions: [
      { press: 'Dismiss notification' },
      { press: 'Dismiss notification' },
      { press: 'Dismiss notification' },
    ],
  },
  {
    at: [0.6, 0.9],
    screen: /^\w+ \/ iOS \/ Booking$/,
    zoom: 2,
    route: 'across',
    actions: [{ press: '28', times: 2 }, { press: '14:00' }],
  },
];
/** The zoom the camera climbs to when it crosses the canvas: hundreds of screens in view. */
const ALTITUDE = 0.06;

/**
 * The session every engine runs. Each action really happens in the components: the same DOM
 * events reach them in both engines, so the GPU has to redraw what changed.
 */
function session(
  canvas: Stage,
  bounds: Rect,
  clusters: BenchCluster[],
  marquee: ReturnType<typeof createMarquee>,
): Step[] {
  const w = canvas.surface.clientWidth;
  const h = canvas.surface.clientHeight;
  const overview = fitCamera(bounds, w, h);
  const frame = (rect: Rect, max = 1) => {
    const { x, y } = center(rect);
    return centeredOn(x, y, Math.min(max, fitCamera(rect, w, h, 64).zoom), w, h);
  };
  const node = (c: BenchCluster, i: number) =>
    document.querySelector<HTMLElement>(`.${nodeClass(c.id, i)}`);
  /** Where `element` sits in the world, from its offset inside its node at any zoom. */
  const worldPoint = (c: BenchCluster, i: number, element: Element) => {
    const box = node(c, i)!.getBoundingClientRect();
    const r = element.getBoundingClientRect();
    const scale = c.items[i].rect.width / box.width;
    return {
      x: c.items[i].rect.x + (r.x + r.width / 2 - box.x) * scale,
      y: c.items[i].rect.y + (r.y + r.height / 2 - box.y) * scale,
    };
  };
  const toScreen = (p: { x: number; y: number }) => {
    const cam = canvas.getCamera();
    return { x: (p.x - cam.x) * cam.zoom, y: (p.y - cam.y) * cam.zoom };
  };
  const label = (e: HTMLElement) =>
    (e.dataset.act || e.textContent?.trim() || e.getAttribute('aria-label') || '').replace(
      /\s+/g,
      ' ',
    );
  /** The control in item `i` whose label starts with `text`; a label's own input stands for it. */
  const control = (c: BenchCluster, i: number, text: string) => {
    const all = node(c, i)?.querySelectorAll<HTMLElement>(
      'button, [role="button"], [role="tab"], label, input, textarea',
    );
    const hit = [...(all ?? [])].find((e) =>
      e instanceof HTMLInputElement ? e.placeholder.startsWith(text) : label(e).startsWith(text),
    );
    if (hit instanceof HTMLLabelElement) return hit.control ?? hit;
    return hit ?? null;
  };
  /** Clicks the control as the step starts: earlier actions may have moved or replaced it. */
  const press =
    (c: BenchCluster, i: number, text: string, times = 1) =>
    () => {
      const element = control(c, i, text);
      if (!element) return null;
      const at = toScreen(worldPoint(c, i, element));
      for (let n = 0; n < times; n++) element.click();
      return { t: 0, kind: 'click' as const, ...at, text };
    };

  // A first look at everything before the camera moves.
  const steps: Step[] = [{ ms: 3000 }];
  let here: Rect | null = null;
  for (const stop of TOUR) {
    const point = {
      x: bounds.x + stop.at[0] * bounds.width,
      y: bounds.y + stop.at[1] * bounds.height,
      width: 0,
      height: 0,
    };
    const candidates = clusters
      .map((c) => ({ c, i: c.items.findIndex((item) => stop.screen.test(item.name ?? '')) }))
      .filter(({ i }) => i >= 0)
      .sort((a, b) => distance(a.c.bounds, point) - distance(b.c.bounds, point));
    if (!candidates.length) continue;
    const { c, i } = candidates[0];
    const screen = c.items[i].rect;
    if (!here || stop.route === 'dive')
      steps.push({ ms: 2800, to: frame(c.bounds), move: 'dive' }, { ms: 300 });
    else if (stop.route === 'overview')
      steps.push(
        { ms: 2600, to: overview, move: 'overview' },
        { ms: 600 },
        { ms: 2800, to: frame(c.bounds), move: 'dive' },
      );
    else {
      const from = center(here);
      const to = center(c.bounds);
      const across = Math.hypot(to.x - from.x, to.y - from.y) * ALTITUDE;
      steps.push(
        { ms: 1800, to: centeredOn(from.x, from.y, ALTITUDE, w, h), move: 'climb' },
        {
          ms: Math.min(2800, Math.max(1600, across * 1.6)),
          to: centeredOn(to.x, to.y, ALTITUDE, w, h),
          move: 'across',
        },
        { ms: 2200, to: frame(c.bounds), move: 'dive' },
      );
    }
    steps.push({ ms: 1600, to: frame(screen, stop.zoom), move: 'screen' }, { ms: 400 });
    for (const action of stop.actions) {
      if ('into' in action) {
        const input = control(c, i, action.into);
        if (!(input instanceof HTMLInputElement)) continue;
        steps.push({
          ms: 300 + action.text.length * 60,
          type: {
            input,
            text: action.text,
            at: () => toScreen(worldPoint(c, i, input)),
          },
        });
        steps.push({ ms: 500 });
      } else if ('wait' in action) steps.push({ ms: action.wait });
      else steps.push({ ms: 1000, act: press(c, i, action.press, action.times) });
    }
    here = c.bounds;
    // The tour ends close up: a push to 500% on what was just changed.
    const lastAction = stop.actions[stop.actions.length - 1];
    if (stop === TOUR[TOUR.length - 1] && 'press' in lastAction) {
      const last = control(c, i, lastAction.press);
      if (last) {
        const p = worldPoint(c, i, last);
        steps.push(
          { ms: 1800, to: centeredOn(p.x, p.y + 40, 5, w, h), move: 'push' },
          { ms: 2000 },
        );
      }
    }
  }
  steps.push({ ms: 3400, to: overview, move: 'out' }, { ms: 1000 });
  // Out at everything, a selection box sweeps across a third of the canvas: every screen it
  // touches is outlined as it grows.
  const from = { x: w * 0.16, y: h * 0.14 };
  const to = { x: w * 0.6, y: h * 0.84 };
  let count = 0;
  steps.push(
    {
      ms: 2600,
      move: 'select',
      each: (t) => {
        count = marquee.update(from, {
          x: from.x + (to.x - from.x) * t,
          y: from.y + (to.y - from.y) * t,
        }).length;
      },
    },
    {
      ms: 1400,
      act: () => {
        marquee.hide();
        return { t: 0, kind: 'select', ...to, text: String(count) };
      },
    },
    { ms: 0, move: 'end' },
  );
  return steps;
}

/** The session's length in ms, for progress bars; the tour runs about this long. */
export const BENCH_DURATION_MS = 99_000;

/** Runs the bench session on `canvas` and measures every frame. */
export function runBench(
  canvas: Stage,
  bounds: Rect,
  clusters: BenchCluster[],
  mountMs: number,
  onProgress?: (t: number) => void,
): Promise<BenchResult> {
  const marquee = createMarquee(canvas);
  const steps = session(canvas, bounds, clusters, marquee);
  const total = steps.reduce((sum, step) => sum + step.ms, 0);
  return new Promise((resolve) => {
    const deltas: number[] = [];
    const log: BenchEvent[] = [];
    const start = performance.now();
    let last = start;
    let index = -1;
    let stepStart = start;
    let from = canvas.getCamera();
    const tick = (now: number) => {
      deltas.push(now - last);
      last = now;
      const elapsed = Math.max(0, now - start);
      while (index < steps.length - 1 && (index < 0 || now - stepStart >= steps[index].ms)) {
        if (index >= 0) stepStart += steps[index].ms;
        else stepStart = start;
        index++;
        from = canvas.getCamera();
        const move = steps[index].move;
        if (move) log.push({ t: Math.round(now - start), kind: 'move', x: 0, y: 0, text: move });
        const event = steps[index].act?.();
        if (event) log.push({ ...event, t: Math.round(now - start) });
        const typing = steps[index].type;
        if (typing) {
          typing.input.focus({ preventScroll: true });
          log.push({ t: Math.round(now - start), kind: 'click', ...typing.at() });
        }
      }
      const step = steps[index];
      const t = step.ms > 0 ? Math.min(1, (now - stepStart) / step.ms) : 1;
      if (step.to) canvas.setCamera(lerpCamera(from, step.to, ease(t)));
      step.each?.(ease(t));
      if (step.type) {
        const text = step.type.text.slice(0, Math.ceil(t * step.type.text.length));
        if (step.type.input.value !== text) {
          valueSetter.call(step.type.input, text);
          step.type.input.dispatchEvent(new Event('input', { bubbles: true }));
          log.push({ t: Math.round(now - start), kind: 'type', ...step.type.at(), text });
        }
      }
      onProgress?.(Math.min(1, elapsed / total));
      if (elapsed < total) return requestAnimationFrame(tick);
      marquee.remove();
      canvas.setSelection([]);
      const sorted = deltas.slice(1).sort((a, b) => a - b);
      const sum = sorted.reduce((acc, value) => acc + value, 0);
      resolve({
        mode: canvas.mode,
        nodes: canvas.getStats().nodes,
        frames: sorted.length,
        avgFps: Math.round((sorted.length / sum) * 1000),
        p50Ms: +sorted[Math.floor(sorted.length * 0.5)].toFixed(1),
        p95Ms: +sorted[Math.floor(sorted.length * 0.95)].toFixed(1),
        jankPercent: +((sorted.filter((value) => value > 20).length / sorted.length) * 100).toFixed(
          1,
        ),
        mountMs: Math.round(mountMs),
        at: Date.now(),
        log,
      });
    };
    requestAnimationFrame(tick);
  });
}

/** Animates the camera to `target`. */
export function flyTo(canvas: Stage, target: Camera, duration = 1400): Promise<void> {
  const from = canvas.getCamera();
  return new Promise((resolve) => {
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, Math.max(0, (now - start) / duration));
      canvas.setCamera(lerpCamera(from, target, ease(t)));
      if (t < 1) requestAnimationFrame(tick);
      else resolve();
    };
    requestAnimationFrame(tick);
  });
}

const STORAGE_KEY = 'gpucanvas.bench';

/** Latest result per node count and mode, kept across the reloads a mode switch needs. */
export function loadResults(): Record<string, BenchResult> {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
  } catch {
    return {};
  }
}

export function saveResult(result: BenchResult) {
  const results = loadResults();
  results[`${result.nodes}:${result.mode}`] = result;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(results));
  } catch {
    // Private windows can refuse storage; the result still shows until reload.
  }
  return results;
}
