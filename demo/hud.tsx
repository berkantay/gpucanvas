import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  RiCloseLine,
  RiCursorLine,
  RiEqualizerLine,
  RiMoonLine,
  RiPlayFill,
  RiSunLine,
} from '@remixicon/react';
import {
  Badge,
  Button,
  cx,
  IconButton,
  Kbd,
  SegmentedControl,
  SegmentedControlItem,
  Select,
  SelectItem,
} from './ui';
import { BENCH_DURATION_MS, resultKey, type BenchResult } from './bench';
import { DEMO_EFFECTS, type DemoEffect } from './effects';
import { MODE_LABEL, MODES, type Mode, type Stage } from './stage';

export const NODE_COUNTS = [250, 1_000, 2_500, 5_000, 10_000];
/** What a click selects: a React component, a single element, or a whole screen. */
export type Pick = 'component' | 'element' | 'node';
const PICKS: { id: Pick; label: string }[] = [
  { id: 'component', label: 'Components' },
  { id: 'element', label: 'Elements' },
  { id: 'node', label: 'Screens' },
];
export const parsePick = (value: string | null): Pick =>
  PICKS.find((pick) => pick.id === value)?.id ?? 'component';
const PANEL =
  'rounded-2xl border border-border-button-default bg-background-primary-default shadow-dropdown';
const format = (value: number) => value.toLocaleString('en-US');

export function Toolbar({
  mode,
  gpuSupported,
  nodes,
  benchProgress,
  dark,
  canBench,
  effect,
  edit,
  pick,
  agents,
  onMode,
  onNodes,
  onEffect,
  onEdit,
  onPick,
  onAgents,
  onBench,
  onTheme,
}: {
  mode: Mode;
  gpuSupported: boolean;
  nodes: number;
  benchProgress: number | null;
  dark: boolean;
  canBench: boolean;
  effect: DemoEffect | null;
  edit: boolean;
  pick: Pick;
  agents: boolean;
  onMode: (mode: Mode) => void;
  onNodes: (nodes: number) => void;
  onEffect: (effect: DemoEffect | null) => void;
  onEdit: (edit: boolean) => void;
  onPick: (pick: Pick) => void;
  onAgents: (agents: boolean) => void;
  onBench: () => void;
  onTheme: () => void;
}) {
  const counts = NODE_COUNTS.includes(nodes)
    ? NODE_COUNTS
    : [...NODE_COUNTS, nodes].sort((a, b) => a - b);
  // On a phone the bar shows the logo and Edit or Interact; the rest opens below them.
  const [expanded, setExpanded] = useState(false);
  const more = cx('contents', !expanded && 'max-sm:hidden');
  return (
    <div
      className={cx(
        PANEL,
        'fixed inset-x-2 top-2 z-20 flex flex-wrap items-center gap-2 p-2 sm:top-4 sm:right-auto sm:left-4 sm:max-w-[calc(100vw-20rem)]',
      )}
    >
      <span className="ps-1" title="gpucanvas">
        <Logo />
      </span>
      <span className={more}>
        <SegmentedControl
          aria-label="Renderer"
          selectedKeys={[mode]}
          onSelectionChange={(keys) => {
            const key = [...keys][0];
            if (MODES.includes(key as Mode)) onMode(key as Mode);
          }}
        >
          {MODES.map((id) => (
            <SegmentedControlItem key={id} id={id} isDisabled={id === 'gpu' && !gpuSupported}>
              {RENDERER_LABEL[id]}
            </SegmentedControlItem>
          ))}
        </SegmentedControl>
        <Select
          aria-label="Components"
          selectedKey={String(nodes)}
          onSelectionChange={(key) => key !== null && onNodes(Number(key))}
          triggerClassName="min-w-44"
        >
          {counts.map((count) => (
            <SelectItem key={count} id={String(count)} textValue={`${format(count)} components`}>
              {format(count)} components
            </SelectItem>
          ))}
        </Select>
      </span>
      <Separator />
      <SegmentedControl
        aria-label="Clicks"
        selectedKeys={[edit ? 'edit' : 'interact']}
        onSelectionChange={(keys) => onEdit([...keys][0] === 'edit')}
      >
        <SegmentedControlItem id="edit">Edit</SegmentedControlItem>
        <SegmentedControlItem id="interact">Interact</SegmentedControlItem>
      </SegmentedControl>
      <span className={more}>
        {edit && (
          <Select
            aria-label="What a click selects"
            selectedKey={pick}
            onSelectionChange={(key) => key !== null && onPick(parsePick(key))}
            triggerClassName="min-w-36"
          >
            {PICKS.map(({ id, label }) => (
              <SelectItem key={id} id={id} textValue={label}>
                {label}
              </SelectItem>
            ))}
          </Select>
        )}
        <Select
          aria-label="Shader effect"
          selectedKey={effect ?? 'none'}
          onSelectionChange={(key) =>
            key !== null && onEffect(key === 'none' ? null : (key as DemoEffect))
          }
          triggerClassName="min-w-28"
        >
          <SelectItem id="none" textValue="No effect">
            No effect
          </SelectItem>
          {Object.entries(DEMO_EFFECTS).map(([id, { label, effect: shader }]) => (
            <SelectItem
              key={id}
              id={id}
              textValue={label}
              isDisabled={mode === 'dom' && !shader.css}
            >
              {mode === 'dom' && !shader.css ? `${label} (GPU only)` : label}
            </SelectItem>
          ))}
        </Select>
        <Separator />
        <IconButton
          icon={RiCursorLine}
          aria-label="Agent cursors"
          title={agents ? 'Agent cursors: on' : 'Agent cursors: off'}
          aria-pressed={agents}
          onClick={() => onAgents(!agents)}
          className={cx(
            agents && 'bg-accent-100 text-accent-700 dark:bg-accent-900 dark:text-accent-300',
          )}
        />
        <Button
          leadingIcon={RiPlayFill}
          disabled={!canBench || benchProgress !== null}
          onClick={onBench}
          className="min-w-32"
        >
          {benchProgress === null
            ? 'Benchmark'
            : `Running ${((benchProgress * BENCH_DURATION_MS) / 1000).toFixed(1)} s`}
        </Button>
        <IconButton
          icon={dark ? RiSunLine : RiMoonLine}
          aria-label={dark ? 'Light theme' : 'Dark theme'}
          onClick={onTheme}
        />
      </span>
      <IconButton
        icon={expanded ? RiCloseLine : RiEqualizerLine}
        aria-label="More controls"
        aria-expanded={expanded}
        onClick={() => setExpanded((value) => !value)}
        className="ms-auto sm:hidden"
      />
    </div>
  );
}

function Logo() {
  return (
    <svg viewBox="0 0 24 24" className="size-7" aria-hidden>
      <rect width="24" height="24" rx="7" className="fill-button-primary" />
      <rect x="6" y="6" width="5" height="5" rx="1.5" className="fill-white" />
      <rect x="13" y="6" width="5" height="5" rx="1.5" className="fill-white/60" />
      <rect x="6" y="13" width="5" height="5" rx="1.5" className="fill-white/60" />
      <rect x="13" y="13" width="5" height="5" rx="1.5" className="fill-white/30" />
    </svg>
  );
}

/** Short labels keep the toolbar on one row; the frame rate badge names the renderer in full. */
const RENDERER_LABEL: Record<Mode, string> = { gpu: 'GPU', dom: 'DOM' };

const Separator = () => (
  <span aria-hidden className="mx-1 h-6 w-px bg-border-button-default max-sm:hidden" />
);

const SPARK_FRAMES = 120;
const SPARK_MAX_MS = 50;

/** Frame rate measured from requestAnimationFrame, with a frame time graph. */
export function Meter({
  canvas,
  mounted,
  total,
}: {
  canvas: Stage | null;
  mounted: number;
  total: number;
}) {
  const path = useRef<SVGPathElement>(null);
  const [fps, setFps] = useState(0);
  const [stats, setStats] = useState(() => canvas?.getStats());

  useEffect(() => {
    const frames: number[] = [];
    let last = performance.now();
    let raf = 0;
    const loop = (now: number) => {
      frames.push(now - last);
      if (frames.length > SPARK_FRAMES) frames.shift();
      last = now;
      let d = '';
      const step = 100 / (SPARK_FRAMES - 1);
      const offset = SPARK_FRAMES - frames.length;
      for (let i = 0; i < frames.length; i++) {
        const y = 40 - (Math.min(frames[i], SPARK_MAX_MS) / SPARK_MAX_MS) * 40;
        d += `${i ? 'L' : 'M'}${((offset + i) * step).toFixed(2)} ${y.toFixed(2)}`;
      }
      path.current?.setAttribute('d', d);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    const timer = setInterval(() => {
      const recent = frames.slice(-30);
      const average = recent.reduce((sum, value) => sum + value, 0) / Math.max(1, recent.length);
      setFps(Math.round(1000 / average));
      if (canvas) setStats(canvas.getStats());
    }, 250);
    return () => {
      cancelAnimationFrame(raf);
      clearInterval(timer);
    };
  }, [canvas]);

  const budget = (ms: number) => 40 - (ms / SPARK_MAX_MS) * 40;
  return (
    <div
      className={cx(
        PANEL,
        'fixed right-2 bottom-2 z-20 px-3 py-1.5 sm:top-4 sm:right-4 sm:bottom-auto sm:w-72 sm:p-4',
      )}
    >
      <div className="flex items-center justify-between max-sm:hidden">
        <span className="text-body-2-medium text-text-secondary">Frame rate</span>
        {stats && (
          <Badge color={stats.mode === 'gpu' ? 'primary' : 'neutral'}>
            {MODE_LABEL[stats.mode]}
          </Badge>
        )}
      </div>
      <div className="flex items-baseline gap-1.5 sm:mt-1">
        <span className="text-display-2-semibold text-text-primary tabular-nums max-sm:text-title-2-semibold">
          {fps}
        </span>
        <span className="text-body-medium text-text-secondary">fps</span>
      </div>
      <svg
        viewBox="0 0 100 40"
        preserveAspectRatio="none"
        className="mt-2 h-12 w-full overflow-visible max-sm:hidden"
        aria-hidden
      >
        <line
          x1="0"
          x2="100"
          y1={budget(16.7)}
          y2={budget(16.7)}
          className="stroke-border-button-default"
          strokeDasharray="2 2"
          vectorEffect="non-scaling-stroke"
        />
        <line
          x1="0"
          x2="100"
          y1={budget(8.3)}
          y2={budget(8.3)}
          className="stroke-border-button-default"
          strokeDasharray="2 2"
          vectorEffect="non-scaling-stroke"
        />
        <path
          ref={path}
          fill="none"
          className="stroke-text-primary"
          strokeWidth="1.5"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <div className="mt-1 flex justify-between text-caption-2-regular text-text-tertiary max-sm:hidden">
        <span>last 120 frames</span>
        <span>dashed: 60 and 120 fps</span>
      </div>
      <dl className="mt-3 flex flex-col gap-1.5 border-t border-border-button-default pt-3 text-body-2-regular max-sm:hidden">
        {mounted < total ? (
          <Row label="Mounting">
            {format(mounted)} / {format(total)}
          </Row>
        ) : (
          <Row label="Components">{format(stats?.nodes ?? total)}</Row>
        )}
        <Row label="In view">{format(stats?.visible ?? 0)}</Row>
        {Number.isFinite(stats?.frameMs) && (
          <Row label="Main thread per frame">{stats!.frameMs.toFixed(2)} ms</Row>
        )}
        {stats?.mode === 'gpu' && <Row label="Waiting for pixels">{format(stats.pending)}</Row>}
      </dl>
      {mounted < total && (
        <div className="mt-3 h-1 overflow-hidden rounded-full bg-background-secondary-default">
          <div
            className="h-full rounded-full bg-button-primary transition-[width] duration-200"
            style={{ width: `${(mounted / total) * 100}%` }}
          />
        </div>
      )}
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-text-secondary">{label}</dt>
      <dd className="text-text-primary tabular-nums">{children}</dd>
    </div>
  );
}

/** The latest run of every engine at this node count, fastest first. */
export function Results({
  nodes,
  effect,
  results,
}: {
  nodes: number;
  effect: DemoEffect | null;
  results: Record<string, BenchResult>;
}) {
  const runs = MODES.map((mode) => ({
    mode,
    result: results[resultKey(nodes, mode, effect)] as BenchResult | undefined,
  }));
  if (!runs.some((run) => run.result)) return null;
  const best = Math.max(60, ...runs.map((run) => run.result?.avgFps ?? 0));
  const ours = runs[0].result;
  const others = runs.slice(1).filter((run) => run.result);
  const rival = others.reduce<(typeof others)[number] | null>(
    (top, run) => (!top || run.result!.avgFps > top.result!.avgFps ? run : top),
    null,
  );
  const ranked = [...runs].sort((a, b) => (b.result?.avgFps ?? -1) - (a.result?.avgFps ?? -1));
  return (
    <div
      className={cx(
        PANEL,
        'fixed right-4 bottom-4 z-20 w-80 p-4 max-sm:inset-x-2 max-sm:bottom-14 max-sm:w-auto',
      )}
    >
      <div className="flex items-baseline justify-between">
        <span className="text-body-semibold text-text-primary">Benchmark</span>
        <span className="text-body-2-regular text-text-secondary">
          {format(nodes)} components{effect ? `, ${DEMO_EFFECTS[effect].label.toLowerCase()}` : ''}
        </span>
      </div>
      {ours && rival && (
        <p className="mt-2 text-title-2-semibold text-text-primary">
          {(ours.avgFps / rival.result!.avgFps).toFixed(1)}x {MODE_LABEL[rival.mode]}
        </p>
      )}
      <div className="mt-3 flex flex-col gap-3">
        {ranked.map(({ mode, result }) => (
          <ResultRow key={mode} mode={mode} result={result} best={best} />
        ))}
      </div>
    </div>
  );
}

function ResultRow({ mode, result, best }: { mode: Mode; result?: BenchResult; best: number }) {
  return (
    <div>
      <div className="flex items-baseline justify-between text-body-2-medium">
        <span className="text-text-primary">{MODE_LABEL[mode]}</span>
        <span className="text-text-primary tabular-nums">
          {result ? `${result.avgFps} fps` : 'not run'}
        </span>
      </div>
      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-background-secondary-default">
        <div
          className={cx(
            'h-full rounded-full',
            mode === 'gpu' ? 'bg-button-primary' : 'bg-text-tertiary',
          )}
          style={{ width: `${((result?.avgFps ?? 0) / best) * 100}%` }}
        />
      </div>
      {result && (
        <div className="mt-1 flex justify-between text-caption-1-regular text-text-secondary tabular-nums">
          <span>p95 {result.p95Ms} ms</span>
          <span>{result.jankPercent}% frames over 20 ms</span>
        </div>
      )}
    </div>
  );
}

const FLAG = 'chrome://flags/#canvas-draw-element';
/** Every iPhone and iPad browser runs on WebKit, which has no HTML-in-Canvas and no flag for it. */
const WEBKIT =
  /iP(hone|ad|od)/.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const REPO = 'https://github.com/berkantay/gpucanvas';
const DISMISSED = 'gpucanvas.flagNotice';

/** For browsers without HTML-in-Canvas: what they are seeing, and how to see the GPU path. */
export function FlagNotice() {
  const [open, setOpen] = useState(() => {
    try {
      return localStorage.getItem(DISMISSED) !== '1';
    } catch {
      return true;
    }
  });
  const [copied, setCopied] = useState(false);
  if (!open) return null;
  const copy = () =>
    navigator.clipboard?.writeText(FLAG).then(
      () => setCopied(true),
      () => {},
    );
  const close = () => {
    setOpen(false);
    try {
      localStorage.setItem(DISMISSED, '1');
    } catch {
      // It shows again next visit.
    }
  };
  return (
    <div
      className={cx(
        PANEL,
        'fixed top-20 left-4 z-20 w-[min(26rem,calc(100vw-2rem))] max-sm:top-16 max-sm:left-2 p-4 text-body-2-regular text-text-secondary',
      )}
    >
      <div className="text-body-1-semibold text-text-primary">You are seeing the DOM fallback</div>
      <p className="mt-1">
        {WEBKIT
          ? 'gpucanvas draws with WebGPU and HTML-in-Canvas, which iPhone and iPad browsers do not have yet. This is the plain DOM version. Open the page in Chrome on a computer or Android to see the GPU one.'
          : 'gpucanvas draws with WebGPU and HTML-in-Canvas. Chrome 157 and later has it; if it is off, turn on the flag.'}
      </p>
      {!WEBKIT && (
        <ol className="mt-3 list-decimal space-y-1 ps-5">
          <li>
            Open <code className="text-text-primary">{FLAG}</code>
          </li>
          <li>Set it to Enabled and relaunch Chrome</li>
          <li>Come back to this page</li>
        </ol>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        {!WEBKIT && (
          <Button size="small" onClick={copy}>
            {copied ? 'Copied' : 'Copy flag address'}
          </Button>
        )}
        <Button
          size="small"
          variant="secondary"
          onClick={() => window.open(`${REPO}/releases/latest`, '_blank', 'noreferrer')}
        >
          Watch the film
        </Button>
        <Button size="small" variant="secondary" onClick={close}>
          Hide
        </Button>
      </div>
    </div>
  );
}

export function Hints({ edit }: { edit: boolean }) {
  return (
    <>
      <div
        className={cx(
          PANEL,
          'fixed bottom-2 left-2 z-20 px-3 py-2.5 text-caption-1-regular text-text-secondary sm:hidden',
        )}
      >
        Drag to pan, pinch to zoom{edit ? ', tap to select' : ''}
      </div>
      <div
        className={cx(
          PANEL,
          'fixed bottom-4 left-4 z-20 flex items-center gap-4 px-4 py-2.5 text-body-2-regular text-text-secondary max-sm:hidden',
        )}
      >
        <span className="flex items-center gap-1.5">
          <Kbd>Drag</Kbd> or <Kbd>Scroll</Kbd> to pan
        </span>
        <span className="flex items-center gap-1.5">
          <Kbd>⌘</Kbd>
          <Kbd>Scroll</Kbd> to zoom
        </span>
        {edit ? (
          <>
            <span className="flex items-center gap-1.5">
              <Kbd>Click</Kbd> to select
            </span>
            <span className="flex items-center gap-1.5">
              <Kbd>Double-click</Kbd> to go deeper or type
            </span>
            <span className="flex items-center gap-1.5">
              <Kbd>Drag</Kbd> to move
            </span>
          </>
        ) : (
          <span className="flex items-center gap-1.5">
            <Kbd>Shift</Kbd> click or drag to select
          </span>
        )}
        <span className="flex items-center gap-1.5">
          <Kbd>F</Kbd> fit
        </span>
        <span className="flex items-center gap-1.5">
          <Kbd>B</Kbd> benchmark
        </span>
      </div>
    </>
  );
}
