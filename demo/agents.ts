import type { Rect } from '../src/index';
import type { Point } from './marquee';
import type { Stage } from './stage';

/**
 * Agents at work on the canvas. On load the canvas opens on one cluster of blank screens and the
 * agents build them: each cursor drags a box over a block, the block appears inside it, and the
 * cursor moves on. Then the camera pulls out to everything, and after that each agent keeps
 * rebuilding screens near the edge of the view. Every block appears through a
 * CSS transition inside a live React screen, so the renderer redraws those screens while the
 * camera keeps moving.
 */
/** Every agent wears Claude's clay. */
const COLOR = '#d97757';
const NAME = 'Claude';
/** The Claude mark, from simple-icons (CC0). */
const MARK =
  'm4.7144 15.9555 4.7174-2.6471.079-.2307-.079-.1275h-.2307l-.7893-.0486-2.6956-.0729-2.3375-.0971-2.2646-.1214-.5707-.1215-.5343-.7042.0546-.3522.4797-.3218.686.0608 1.5179.1032 2.2767.1578 1.6514.0972 2.4468.255h.3886l.0546-.1579-.1336-.0971-.1032-.0972L6.973 9.8356l-2.55-1.6879-1.3356-.9714-.7225-.4918-.3643-.4614-.1578-1.0078.6557-.7225.8803.0607.2246.0607.8925.686 1.9064 1.4754 2.4893 1.8336.3643.3035.1457-.1032.0182-.0728-.164-.2733-1.3539-2.4467-1.445-2.4893-.6435-1.032-.17-.6194c-.0607-.255-.1032-.4674-.1032-.7285L6.287.1335 6.6997 0l.9957.1336.419.3642.6192 1.4147 1.0018 2.2282 1.5543 3.0296.4553.8985.2429.8318.091.255h.1579v-.1457l.1275-1.706.2368-2.0947.2307-2.6957.0789-.7589.3764-.9107.7468-.4918.5828.2793.4797.686-.0668.4433-.2853 1.8517-.5586 2.9021-.3643 1.9429h.2125l.2429-.2429.9835-1.3053 1.6514-2.0643.7286-.8196.85-.9046.5464-.4311h1.0321l.759 1.1293-.34 1.1657-1.0625 1.3478-.8804 1.1414-1.2628 1.7-.7893 1.36.0729.1093.1882-.0183 2.8535-.607 1.5421-.2794 1.8396-.3157.8318.3886.091.3946-.3278.8075-1.967.4857-2.3072.4614-3.4364.8136-.0425.0304.0486.0607 1.5482.1457.6618.0364h1.621l3.0175.2247.7892.522.4736.6376-.079.4857-1.2142.6193-1.6393-.3886-3.825-.9107-1.3113-.3279h-.1822v.1093l1.0929 1.0686 2.0035 1.8092 2.5075 2.3314.1275.5768-.3218.4554-.34-.0486-2.2039-1.6575-.85-.7468-1.9246-1.621h-.1275v.17l.4432.6496 2.3436 3.5214.1214 1.0807-.17.3521-.6071.2125-.6679-.1214-1.3721-1.9246L14.38 17.959l-1.1414-1.9428-.1397.079-.674 7.2552-.3156.3703-.7286.2793-.6071-.4614-.3218-.7468.3218-1.4753.3886-1.9246.3157-1.53.2853-1.9004.17-.6314-.0121-.0425-.1397.0182-1.4328 1.9672-2.1796 2.9446-1.7243 1.8456-.4128.164-.7164-.3704.0667-.6618.4008-.5889 2.386-3.0357 1.4389-1.882.929-1.0868-.0062-.1579h-.0546l-6.3385 4.1164-1.1293.1457-.4857-.4554.0608-.7467.2307-.2429 1.9064-1.3114Z';
const ARROW = 'M1 1 L1 16 L5.2 12.2 L8 18.5 L10.8 17.3 L8.1 11.1 L13.8 11.1 Z';

/** How an agent works: blocks per screen, then ms to reach a block, drag its box and rest. */
interface Pace {
  steps: number;
  reach: number;
  drag: number;
  settle: number;
  flight: number;
}
const INTRO: Pace = { steps: 6, reach: 110, drag: 170, settle: 40, flight: 320 };
const AMBIENT: Pace = { steps: 10, reach: 240, drag: 340, settle: 120, flight: 700 };
/** The middle of the view, as a share of each side, is left alone: that is where people look. */
const FOCUS = 0.4;
/** Screens smaller than this on screen are too small to watch being built. */
const MIN_SCREEN_PX = 24;
/** Screens are picked this far inside the edges of the view, in screen pixels. */
const MARGIN_PX = 48;
/** The intro gives up waiting for its screens after this long. */
const INTRO_TIMEOUT_MS = 12_000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const ease = (t: number) => 1 - (1 - t) ** 3;
const overlaps = (a: Rect, b: Rect) =>
  a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
const centre = (r: Rect): Point => ({ x: r.x + r.width / 2, y: r.y + r.height / 2 });
const union = (rects: Rect[]): Rect => {
  const x = Math.min(...rects.map((r) => r.x));
  const y = Math.min(...rects.map((r) => r.y));
  return {
    x,
    y,
    width: Math.max(...rects.map((r) => r.x + r.width)) - x,
    height: Math.max(...rects.map((r) => r.y + r.height)) - y,
  };
};

/** The blocks a screen is built from, in reading order: big containers split into their children. */
function piecesOf(root: HTMLElement) {
  const total = root.offsetWidth * root.offsetHeight;
  const pieces: HTMLElement[] = [];
  const walk = (element: HTMLElement) => {
    const children = [...element.children].filter(
      (child): child is HTMLElement => child instanceof HTMLElement && child.offsetWidth > 0,
    );
    if (element.offsetWidth * element.offsetHeight > total * 0.12 && children.length)
      children.forEach(walk);
    else if (element.offsetWidth > 0) pieces.push(element);
  };
  [...root.children].forEach((child) => child instanceof HTMLElement && walk(child));
  return pieces;
}

/** How a block appears: text types in line by line, pictures come into focus, the rest pops in. */
function kindOf(piece: HTMLElement) {
  if (piece.querySelector('img, svg, canvas') || /^(IMG|SVG|CANVAS)$/i.test(piece.tagName))
    return 'agent-image';
  if (piece.textContent?.trim() && !piece.querySelector('div, button, input, ul, table'))
    return 'agent-text';
  return 'agent-block';
}

const html = (markup: string) => {
  const template = document.createElement('template');
  template.innerHTML = markup.trim();
  return template.content.firstElementChild as HTMLElement;
};

function cursor(color: string) {
  return html(`<div style="position:absolute;left:0;top:0;pointer-events:none;z-index:3;will-change:transform;display:none">
    <div data-trail style="position:absolute;left:3px;top:3px;height:3px;border-radius:2px;transform-origin:0 50%;opacity:0;background:linear-gradient(90deg,${color},transparent)"></div>
    <svg width="18" height="20" viewBox="0 0 18 20" style="position:relative;display:block;filter:drop-shadow(0 1px 2px rgb(0 0 0 / 0.3))"><path d="${ARROW}" fill="${color}" stroke="white" stroke-width="1.5" stroke-linejoin="round"/></svg>
    <span style="position:absolute;left:14px;top:17px;display:flex;align-items:center;gap:5px;background:${color};color:white;font:600 12px/1 Inter Variable,sans-serif;padding:4px 8px 4px 6px;border-radius:999px;white-space:nowrap;box-shadow:0 1px 3px rgb(0 0 0 / 0.25)"><svg width="13" height="13" viewBox="0 0 24 24" fill="white"><path d="${MARK}"/></svg>${NAME}</span>
  </div>`);
}

/** The box an agent drags over a block: an outline, a handle on each corner and the block's size. */
function selectionBox(color: string, size: string) {
  const handle = (x: number, y: number) =>
    `<i style="position:absolute;left:${x * 100}%;top:${y * 100}%;width:7px;height:7px;transform:translate(-50%,-50%);background:white;border:1.5px solid ${color}"></i>`;
  return html(`<div style="position:absolute;left:0;top:0;pointer-events:none;z-index:2;border:1.5px solid ${color};background:${color}14;border-radius:2px">
    ${handle(0, 0)}${handle(1, 0)}${handle(0, 1)}${handle(1, 1)}
    <span style="position:absolute;left:50%;top:100%;margin-top:6px;transform:translateX(-50%);background:${color};color:white;font:500 10px/1.2 ui-monospace,monospace;padding:1px 4px;border-radius:3px;white-space:nowrap">${size}</span>
  </div>`);
}

function statusPill() {
  return html(`<div style="position:absolute;left:50%;bottom:84px;transform:translateX(-50%);pointer-events:none;z-index:4;display:flex;align-items:center;gap:10px;padding:8px 14px;border-radius:999px;background:rgb(24 24 27 / 0.86);color:white;font:500 13px/1 Inter Variable,sans-serif;box-shadow:0 4px 16px rgb(0 0 0 / 0.3);transition:opacity 400ms">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="${COLOR}"><path d="${MARK}"/></svg>
    <span data-text></span>
  </div>`);
}

export interface Agents {
  /** Settles once the intro's screens are built, at once when there is no intro. */
  introDone: Promise<void>;
  /** Shows any intro screen still blank and sets the agents to work as usual. */
  release(): void;
  stop(): void;
}

/** Starts `count` agents on `canvas`. With `intro`, the screens in it are built first. */
export function startAgents(canvas: Stage, count: number, intro: Rect | null): Agents {
  const layer = html(
    '<div style="position:absolute;inset:0;overflow:hidden;pointer-events:none;z-index:1"></div>',
  );
  canvas.surface.append(layer);
  let phase: 'intro' | 'waiting' | 'ambient' = intro ? 'intro' : 'ambient';
  const building = new Set<HTMLElement>();
  let stopped = false;
  const pill = statusPill();
  const pillText = pill.querySelector<HTMLElement>('[data-text]')!;
  if (intro) layer.append(pill);

  let finishIntro = () => {};
  const introDone = new Promise<void>((resolve) => {
    finishIntro = () => {
      if (phase === 'intro') phase = 'waiting';
      resolve();
    };
  });
  if (!intro) finishIntro();
  else setTimeout(finishIntro, INTRO_TIMEOUT_MS);

  const view = (): Rect => {
    const { x, y, zoom } = canvas.getCamera();
    return {
      x,
      y,
      width: canvas.surface.clientWidth / zoom,
      height: canvas.surface.clientHeight / zoom,
    };
  };
  const screensIn = (rect: Rect) =>
    canvas.getNodesIn(rect).flatMap((node) => {
      const frame = node.querySelector<HTMLElement>('.brand');
      const r = canvas.getNodeRect(node);
      return frame && r ? [{ node, rect: r, frame }] : [];
    });
  type Screen = ReturnType<typeof screensIn>[number];
  /** The screens in the intro's view, the ones cut by its edges too. */
  const introScreens = () => screensIn(intro!);

  /** The intro's nearest blank screen to `from`. */
  const pickIntro = (from: Point) => {
    const blank = introScreens().filter(
      (s) => !building.has(s.node) && !s.frame.classList.contains('agent-built'),
    );
    const distance = (s: Screen) =>
      Math.hypot(centre(s.rect).x - from.x, centre(s.rect).y - from.y);
    return blank.sort((a, b) => distance(a) - distance(b))[0] ?? null;
  };

  /** A screen wholly in view, away from its middle, that nobody is building yet. */
  const pickAmbient = () => {
    const v = view();
    const zoom = canvas.getCamera().zoom;
    const margin = MARGIN_PX / zoom;
    const focus = {
      x: v.x + (v.width * (1 - FOCUS)) / 2,
      y: v.y + (v.height * (1 - FOCUS)) / 2,
      width: v.width * FOCUS,
      height: v.height * FOCUS,
    };
    const candidates = screensIn(v).filter(
      ({ node, rect }) =>
        !building.has(node) &&
        rect.width * zoom >= MIN_SCREEN_PX &&
        !overlaps(rect, focus) &&
        rect.x > v.x + margin &&
        rect.y > v.y + margin &&
        rect.x + rect.width < v.x + v.width - margin &&
        rect.y + rect.height < v.y + v.height - margin,
    );
    return candidates.length ? candidates[Math.floor(Math.random() * candidates.length)] : null;
  };

  // Everything drawn over the canvas is anchored to a world point, so it rides along with the
  // camera: cursors glide between points, boxes grow from one, sparkles burst at one.
  const agents = Array.from({ length: count }, () => {
    const color = COLOR;
    const element = cursor(color);
    layer.append(element);
    const start = centre(view());
    return {
      color,
      element,
      trail: element.querySelector<HTMLElement>('[data-trail]')!,
      from: start,
      to: start,
      start: 0,
      ms: 1,
      shown: false,
    };
  });
  type Agent = (typeof agents)[number];
  const boxes = new Set<{ element: HTMLElement; rect: Rect; start: number; ms: number }>();
  const marks = new Set<{ element: HTMLElement; at: Point }>();

  const where = (agent: Agent, now: number): Point => {
    const t = ease(Math.min(1, (now - agent.start) / agent.ms));
    return {
      x: agent.from.x + (agent.to.x - agent.from.x) * t,
      y: agent.from.y + (agent.to.y - agent.from.y) * t,
    };
  };
  /** Glides the cursor to `to`, a world point; long moves leave a short streak behind. */
  const glide = (agent: Agent, to: Point, ms: number) => {
    const now = performance.now();
    agent.from = where(agent, now);
    agent.to = to;
    agent.start = now;
    agent.ms = ms;
    const zoom = canvas.getCamera().zoom;
    const dx = (agent.from.x - to.x) * zoom;
    const dy = (agent.from.y - to.y) * zoom;
    const distance = Math.hypot(dx, dy);
    if (distance > 160 && agent.shown) {
      agent.trail.style.width = `${Math.min(distance * 0.4, 140)}px`;
      agent.trail.style.rotate = `${Math.atan2(dy, dx)}rad`;
      agent.trail.animate({ opacity: [0, 0.9, 0] }, { duration: ms, easing: 'ease-out' });
    }
    return sleep(ms);
  };
  const sparkle = (at: Point, color: string) => {
    for (let i = 0; i < 3; i++) {
      const element = html(
        `<div style="position:absolute;left:0;top:0;z-index:2;pointer-events:none"><b style="display:block;color:${color};font:700 13px/1 ui-monospace,monospace">+</b></div>`,
      );
      layer.append(element);
      const mark = { element, at };
      marks.add(mark);
      const dx = Math.random() * 44 - 22;
      const dy = Math.random() * 44 - 22;
      element
        .firstElementChild!.animate(
          {
            transform: [
              'translate(-50%,-50%) scale(0)',
              `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(1)`,
            ],
            opacity: [1, 0],
          },
          { duration: 650, delay: i * 60, easing: 'ease-out', fill: 'both' },
        )
        .finished.then(() => {
          marks.delete(mark);
          element.remove();
        });
    }
  };

  let raf = 0;
  const draw = () => {
    const { x, y, zoom } = canvas.getCamera();
    const now = performance.now();
    const screen = (p: Point) => `translate(${(p.x - x) * zoom}px, ${(p.y - y) * zoom}px)`;
    for (const agent of agents) {
      agent.element.style.display = agent.shown ? 'block' : 'none';
      agent.element.style.transform = screen(where(agent, now));
    }
    for (const box of boxes) {
      const t = ease(Math.min(1, (now - box.start) / box.ms));
      box.element.style.transform = screen(box.rect);
      box.element.style.width = `${box.rect.width * zoom * t}px`;
      box.element.style.height = `${box.rect.height * zoom * t}px`;
    }
    for (const mark of marks) mark.element.style.transform = screen(mark.at);
    raf = requestAnimationFrame(draw);
  };
  raf = requestAnimationFrame(draw);

  /** Where `element` sits in the world, from its box inside its node at any zoom. */
  const worldRect = ({ node, rect }: Screen, element: HTMLElement): Rect => {
    const box = node.getBoundingClientRect();
    const r = element.getBoundingClientRect();
    const scale = rect.width / (box.width || 1);
    return {
      x: rect.x + (r.x - box.x) * scale,
      y: rect.y + (r.y - box.y) * scale,
      width: r.width * scale,
      height: r.height * scale,
    };
  };

  const progress = () => {
    if (phase !== 'intro') return;
    const all = introScreens();
    const done = all.filter(
      (s) => s.frame.classList.contains('agent-built') && !building.has(s.node),
    ).length;
    pillText.textContent = `${count} agents building · ${done} of ${all.length} screens`;
  };

  /** Clears the screen and builds it back up: a box dragged over each block, then the block. */
  const build = async (agent: Agent, target: Screen, pace: Pace) => {
    const { node, rect, frame } = target;
    building.add(node);
    const pieces = piecesOf(frame);
    const per = Math.max(1, Math.ceil(pieces.length / pace.steps));
    // In one task, so a blank intro screen never shows unbuilt blocks in between.
    for (const piece of pieces) piece.classList.add('agent-piece', 'agent-hidden', kindOf(piece));
    frame.style.setProperty('--agent', agent.color);
    frame.classList.add('agent-building', 'agent-built');
    if (!agent.shown) {
      agent.from = agent.to = centre(rect);
      agent.shown = true;
    }
    progress();
    try {
      let first = true;
      for (let i = 0; i < pieces.length && !stopped; i += per) {
        const group = pieces.slice(i, i + per);
        const area = union(group.map((piece) => worldRect(target, piece)));
        await glide(agent, area, first ? pace.flight : pace.reach);
        first = false;
        const element = selectionBox(
          agent.color,
          `${Math.round(area.width)} × ${Math.round(area.height)}`,
        );
        layer.append(element);
        const box = { element, rect: area, start: performance.now(), ms: pace.drag };
        boxes.add(box);
        await glide(agent, { x: area.x + area.width, y: area.y + area.height }, pace.drag);
        for (const piece of group) piece.classList.remove('agent-hidden');
        sparkle({ x: area.x + area.width, y: area.y + area.height }, agent.color);
        element
          .animate({ opacity: [1, 0] }, { duration: 300, delay: 120, fill: 'forwards' })
          .finished.then(() => {
            boxes.delete(box);
            element.remove();
          });
        await sleep(pace.settle);
      }
      await sleep(400);
    } finally {
      for (const piece of pieces)
        piece.classList.remove(
          'agent-hidden',
          'agent-piece',
          'agent-image',
          'agent-text',
          'agent-block',
        );
      frame.classList.remove('agent-building');
      frame.style.removeProperty('--agent');
      building.delete(node);
      progress();
    }
  };

  const work = async (agent: Agent) => {
    while (!stopped) {
      if (phase === 'intro') {
        const target = pickIntro(where(agent, performance.now()));
        if (target) await build(agent, target, INTRO);
        else if (!building.size && introScreens().length) finishIntro();
        else await sleep(80);
      } else if (phase === 'waiting') {
        await sleep(100);
      } else {
        const target = pickAmbient();
        if (target) await build(agent, target, AMBIENT);
        else {
          agent.shown = false;
          await sleep(600);
        }
      }
    }
  };
  agents.forEach((agent, i) => setTimeout(() => work(agent), i * (intro ? 40 : 150)));

  return {
    introDone,
    release() {
      if (phase === 'ambient') return;
      phase = 'ambient';
      if (!intro) return;
      for (const s of introScreens()) s.frame.classList.add('agent-built');
      pill.style.opacity = '0';
      setTimeout(() => pill.remove(), 400);
    },
    stop() {
      stopped = true;
      cancelAnimationFrame(raf);
      layer.remove();
    },
  };
}
