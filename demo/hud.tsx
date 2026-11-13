import { useEffect, useRef, useState, type ReactNode } from 'react';
import { RiMoonLine, RiPlayFill, RiSunLine } from '@remixicon/react';
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

export const NODE_COUNTS = [1_000, 2_500, 5_000, 10_000];
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
  onMode,
  onNodes,
  onEffect,
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
  onMode: (mode: Mode) => void;
  onNodes: (nodes: number) => void;
  onEffect: (effect: DemoEffect | null) => void;
  onBench: () => void;
  onTheme: () => void;
}) {
  return (
    <div className={cx(PANEL, 'fixed top-4 left-4 z-20 flex items-center gap-2 p-2')}>
      <div className="flex items-center gap-2 ps-1 pe-2">
        <Logo />
        <span className="text-body-semibold text-text-primary">gpucanvas</span>
      </div>
      <Separator />
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
            {MODE_LABEL[id]}
          </SegmentedControlItem>
        ))}
      </SegmentedControl>
      <Select
        aria-label="Components"
        selectedKey={String(nodes)}
        onSelectionChange={(key) => key !== null && onNodes(Number(key))}
        triggerClassName="min-w-44"
      >
        {NODE_COUNTS.map((count) => (
          <SelectItem key={count} id={String(count)} textValue={`${format(count)} components`}>
            {format(count)} components
          </SelectItem>
        ))}
      </Select>
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
          <SelectItem key={id} id={id} textValue={label} isDisabled={mode === 'dom' && !shader.css}>
            {mode === 'dom' && !shader.css ? `${label} (GPU only)` : label}
          </SelectItem>
        ))}
      </Select>
      <Button
        leadingIcon={RiPlayFill}
        disabled={!canBench || benchProgress !== null}
        onClick={onBench}
        className="min-w-40"
      >
        {benchProgress === null
          ? 'Run benchmark'
          : `Running ${((benchProgress * BENCH_DURATION_MS) / 1000).toFixed(1)} s`}
      </Button>
      <IconButton
        icon={dark ? RiSunLine : RiMoonLine}
        aria-label={dark ? 'Light theme' : 'Dark theme'}
        onClick={onTheme}
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

const Separator = () => <span aria-hidden className="mx-1 h-6 w-px bg-border-button-default" />;

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
    <div className={cx(PANEL, 'fixed top-4 right-4 z-20 w-72 p-4')}>
      <div className="flex items-center justify-between">
        <span className="text-body-2-medium text-text-secondary">Frame rate</span>
        {stats && (
          <Badge color={stats.mode === 'gpu' ? 'primary' : 'neutral'}>
            {MODE_LABEL[stats.mode]}
          </Badge>
        )}
      </div>
      <div className="mt-1 flex items-baseline gap-1.5">
        <span className="text-display-2-semibold text-text-primary tabular-nums">{fps}</span>
        <span className="text-body-medium text-text-secondary">fps</span>
      </div>
      <svg
        viewBox="0 0 100 40"
        preserveAspectRatio="none"
        className="mt-2 h-12 w-full overflow-visible"
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
      <div className="mt-1 flex justify-between text-caption-2-regular text-text-tertiary">
        <span>last 120 frames</span>
        <span>dashed: 60 and 120 fps</span>
      </div>
      <dl className="mt-3 flex flex-col gap-1.5 border-t border-border-button-default pt-3 text-body-2-regular">
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
    <div className={cx(PANEL, 'fixed right-4 bottom-4 z-20 w-80 p-4')}>
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
        'fixed top-20 left-4 z-20 w-[min(26rem,calc(100vw-2rem))] p-4 text-body-2-regular text-text-secondary',
      )}
    >
      <div className="text-body-1-semibold text-text-primary">You are seeing the DOM fallback</div>
      <p className="mt-1">
        gpucanvas draws with WebGPU and HTML-in-Canvas. Chrome 157 and later has it behind a flag.
      </p>
      <ol className="mt-3 list-decimal space-y-1 ps-5">
        <li>
          Open <code className="text-text-primary">{FLAG}</code>
        </li>
        <li>Set it to Enabled and relaunch Chrome</li>
        <li>Come back to this page</li>
      </ol>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button size="small" onClick={copy}>
          {copied ? 'Copied' : 'Copy flag address'}
        </Button>
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
    <div
      className={cx(
        PANEL,
        'fixed bottom-4 left-4 z-20 flex items-center gap-4 px-4 py-2.5 text-body-2-regular text-text-secondary',
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
  );
}
