import type { Rect } from '../src/index';
import type { Point } from './marquee';
import type { Stage } from './stage';

/**
 * Agents at work on the canvas: each cursor flies to a screen near the edge of the view, clears it
 * and builds it back up piece by piece. Every piece fades in with a CSS transition inside a live
 * React screen, so the renderer redraws those screens while the camera keeps moving.
 */
const AGENTS = [
  { name: 'Claude', color: '#d97757' },
  { name: 'Claude', color: '#8b5cf6' },
  { name: 'Claude', color: '#10b981' },
  { name: 'Claude', color: '#ec4899' },
];
/** A screen splits into about this many build steps. */
const STEPS = 14;
const STEP_MS = 260;
const GLIDE_MS = 240;
const FLIGHT_MS = 700;
/** The middle of the view, as a share of each side, is left alone: that is where people look. */
const FOCUS = 0.4;
/** Screens smaller than this on screen are too small to watch being built. */
const MIN_SCREEN_PX = 24;
/** Screens are picked this far inside the edges of the view, in screen pixels. */
const MARGIN_PX = 48;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const ease = (t: number) => 1 - (1 - t) ** 3;

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

function cursor(color: string, name: string) {
  const element = document.createElement('div');
  element.style.cssText =
    'position:absolute;left:0;top:0;pointer-events:none;z-index:2;will-change:transform;display:none';
  element.innerHTML = `<svg width="18" height="20" viewBox="0 0 18 20" style="display:block;filter:drop-shadow(0 1px 2px rgb(0 0 0 / 0.3))"><path d="M1 1 L1 16 L5.2 12.2 L8 18.5 L10.8 17.3 L8.1 11.1 L13.8 11.1 Z" fill="${color}" stroke="white" stroke-width="1.5" stroke-linejoin="round"/></svg><span style="position:absolute;left:14px;top:17px;background:${color};color:white;font:600 12px/1 Inter Variable,sans-serif;padding:4px 7px;border-radius:6px;white-space:nowrap;box-shadow:0 1px 3px rgb(0 0 0 / 0.25)">${name}</span>`;
  return element;
}

export function startAgents(canvas: Stage, count = AGENTS.length) {
  const layer = document.createElement('div');
  layer.style.cssText = 'position:absolute;inset:0;overflow:hidden;pointer-events:none;z-index:1';
  canvas.surface.append(layer);
  const building = new Set<HTMLElement>();
  let stopped = false;

  const view = (): Rect => {
    const { x, y, zoom } = canvas.getCamera();
    return {
      x,
      y,
      width: canvas.surface.clientWidth / zoom,
      height: canvas.surface.clientHeight / zoom,
    };
  };

  /** A screen wholly in view, away from its middle, that nobody is building yet. */
  const pickScreen = () => {
    const v = view();
    const zoom = canvas.getCamera().zoom;
    const margin = MARGIN_PX / zoom;
    const focus = {
      x: v.x + (v.width * (1 - FOCUS)) / 2,
      y: v.y + (v.height * (1 - FOCUS)) / 2,
      width: v.width * FOCUS,
      height: v.height * FOCUS,
    };
    const candidates = canvas.getNodesIn(v).flatMap((node) => {
      if (building.has(node)) return [];
      const rect = canvas.getNodeRect(node);
      const frame = node.querySelector<HTMLElement>('.brand');
      if (!rect || !frame || rect.width * zoom < MIN_SCREEN_PX) return [];
      const overlapsFocus =
        rect.x < focus.x + focus.width &&
        rect.x + rect.width > focus.x &&
        rect.y < focus.y + focus.height &&
        rect.y + rect.height > focus.y;
      const inside =
        rect.x > v.x + margin &&
        rect.y > v.y + margin &&
        rect.x + rect.width < v.x + v.width - margin &&
        rect.y + rect.height < v.y + v.height - margin;
      return overlapsFocus || !inside ? [] : [{ node, rect, frame }];
    });
    return candidates.length ? candidates[Math.floor(Math.random() * candidates.length)] : null;
  };

  const agents = AGENTS.slice(0, count).map(({ name, color }) => {
    const element = cursor(color, name);
    layer.append(element);
    const v = view();
    const centre = { x: v.x + v.width / 2, y: v.y + v.height / 2 };
    return { color, element, from: centre, to: centre, start: 0, ms: 1, shown: false };
  });
  type Agent = (typeof agents)[number];

  /** Glides the cursor to `to`, a world point, so it stays on its screen while the camera moves. */
  const glide = (agent: Agent, to: Point, ms: number) => {
    const now = performance.now();
    agent.from = where(agent, now);
    agent.to = to;
    agent.start = now;
    agent.ms = ms;
    return sleep(ms);
  };
  const where = (agent: Agent, now: number): Point => {
    const t = ease(Math.min(1, (now - agent.start) / agent.ms));
    return {
      x: agent.from.x + (agent.to.x - agent.from.x) * t,
      y: agent.from.y + (agent.to.y - agent.from.y) * t,
    };
  };

  let raf = 0;
  const draw = () => {
    const { x, y, zoom } = canvas.getCamera();
    const now = performance.now();
    for (const agent of agents) {
      const p = where(agent, now);
      agent.element.style.display = agent.shown ? 'block' : 'none';
      agent.element.style.transform = `translate(${(p.x - x) * zoom}px, ${(p.y - y) * zoom}px)`;
    }
    raf = requestAnimationFrame(draw);
  };
  raf = requestAnimationFrame(draw);

  /** Where `element` sits in the world, from its offset inside its node at any zoom. */
  const worldPoint = (node: HTMLElement, rect: Rect, element: HTMLElement): Point => {
    const box = node.getBoundingClientRect();
    const r = element.getBoundingClientRect();
    const scale = rect.width / (box.width || 1);
    return {
      x: rect.x + (r.x + Math.min(r.width / 2, 40) - box.x) * scale,
      y: rect.y + (r.y + Math.min(r.height / 2, 24) - box.y) * scale,
    };
  };

  const work = async (agent: Agent) => {
    while (!stopped) {
      const target = pickScreen();
      if (!target) {
        agent.shown = false;
        await sleep(600);
        continue;
      }
      const { node, rect, frame } = target;
      building.add(node);
      const pieces = piecesOf(frame);
      const per = Math.max(1, Math.ceil(pieces.length / STEPS));
      for (const piece of pieces) piece.classList.add('agent-piece', 'agent-hidden');
      frame.style.setProperty('--agent', agent.color);
      frame.classList.add('agent-building');
      if (!agent.shown) {
        agent.from = agent.to = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
        agent.shown = true;
      }
      try {
        await glide(agent, worldPoint(node, rect, pieces[0] ?? frame), FLIGHT_MS);
        for (let i = 0; i < pieces.length && !stopped; i += per) {
          const group = pieces.slice(i, i + per);
          await glide(agent, worldPoint(node, rect, group[0]), GLIDE_MS);
          for (const piece of group) piece.classList.remove('agent-hidden');
          await sleep(STEP_MS - GLIDE_MS / 2);
        }
        await sleep(500);
      } finally {
        for (const piece of pieces) piece.classList.remove('agent-hidden', 'agent-piece');
        frame.classList.remove('agent-building');
        frame.style.removeProperty('--agent');
        building.delete(node);
      }
    }
  };
  agents.forEach((agent, i) => setTimeout(() => work(agent), i * 450));

  return () => {
    stopped = true;
    cancelAnimationFrame(raf);
    layer.remove();
  };
}
