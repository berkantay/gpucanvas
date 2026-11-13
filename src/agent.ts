import { visibleWorldRect, type Rect } from './camera';
import type { GpuCanvas } from './types';

/** One element as an agent reads it: what it is, what it says, and where it sits on the canvas. */
export interface AgentElement {
  /** Stable for the life of the agent view; pass it back to `element`, `capture` or a mark. */
  id: string;
  tag: string;
  role?: string;
  /** Its accessible name: aria-label, alt, title or a label's text. */
  name?: string;
  /** Its own text, trimmed. */
  text?: string;
  /** For inputs: the current value. */
  value?: string;
  /** For checkboxes and radios. */
  checked?: boolean;
  rect: Rect;
  children?: AgentElement[];
}

export interface DescribeOptions {
  /** The world rect to read. Default: what is in view. */
  rect?: Rect;
  /** Levels below each node, counting only elements with a role, name, text or value. Default 6. */
  depth?: number;
  /** A name for an element when it has none of its own, such as its React component's. */
  name?: (element: Element) => string | null | undefined;
}

const IMPLICIT_ROLES: Record<string, string> = {
  a: 'link',
  button: 'button',
  img: 'img',
  input: 'textbox',
  textarea: 'textbox',
  select: 'combobox',
  h1: 'heading',
  h2: 'heading',
  h3: 'heading',
  h4: 'heading',
  h5: 'heading',
  h6: 'heading',
  nav: 'navigation',
  ul: 'list',
  ol: 'list',
  li: 'listitem',
  table: 'table',
  dialog: 'dialog',
};
const INPUT_ROLES: Record<string, string> = {
  checkbox: 'checkbox',
  radio: 'radio',
  range: 'slider',
  button: 'button',
  submit: 'button',
  reset: 'button',
  search: 'searchbox',
};
const SKIP = new Set(['script', 'style', 'template', 'noscript']);
const MAX_TEXT = 120;

const ownText = (element: Element) => {
  let text = '';
  for (const child of element.childNodes) {
    if (child.nodeType === Node.TEXT_NODE) text += child.textContent;
  }
  text = text.replace(/\s+/g, ' ').trim();
  return text.length > MAX_TEXT ? `${text.slice(0, MAX_TEXT - 1)}…` : text;
};

/** The text of an input's label, without the input's own value. */
const labelText = (element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement) => {
  const label = element.labels?.[0];
  if (!label) return '';
  let text = '';
  for (const node of label.childNodes) {
    if (node !== element && !(node instanceof Element && node.contains(element))) {
      text += node.textContent;
    }
  }
  return text.replace(/\s+/g, ' ').trim();
};

const sameRect = (a: Rect, b: Rect) =>
  Math.abs(a.x - b.x) < 0.5 &&
  Math.abs(a.y - b.y) < 0.5 &&
  Math.abs(a.width - b.width) < 0.5 &&
  Math.abs(a.height - b.height) < 0.5;

const round = (rect: Rect): Rect => ({
  x: Math.round(rect.x),
  y: Math.round(rect.y),
  width: Math.round(rect.width),
  height: Math.round(rect.height),
});

/**
 * The canvas as an agent sees it: a JSON tree of what is in a region, with ids it can point back
 * at, and images of any region. Wrappers that add nothing (no text, no role, the same box as
 * their only child) are left out, so the tree stays short.
 */
export function createAgentView(canvas: GpuCanvas) {
  const ids = new WeakMap<Element, string>();
  const elements = new Map<string, WeakRef<Element>>();
  let next = 1;
  const idOf = (element: Element) => {
    let id = ids.get(element);
    if (!id) {
      id = `e${next++}`;
      ids.set(element, id);
      elements.set(id, new WeakRef(element));
    }
    return id;
  };

  const read = (element: Element, depth: number, options: DescribeOptions): AgentElement[] => {
    const tag = element.localName;
    if (SKIP.has(tag)) return [];
    const rect = canvas.getElementRect(element);
    if (!rect || rect.width <= 0 || rect.height <= 0) return [];
    const field =
      element instanceof HTMLInputElement ||
      element instanceof HTMLTextAreaElement ||
      element instanceof HTMLSelectElement
        ? element
        : null;
    const input = element instanceof HTMLInputElement ? element : null;
    const toggles = input?.type === 'checkbox' || input?.type === 'radio';
    const role =
      element.getAttribute('role') ??
      (input ? (INPUT_ROLES[input.type] ?? 'textbox') : IMPLICIT_ROLES[tag]);
    const name =
      element.getAttribute('aria-label') ??
      element.getAttribute('alt') ??
      element.getAttribute('title') ??
      ((field && (labelText(field) || field.getAttribute('placeholder'))) ||
        options.name?.(element) ||
        undefined);
    const text = ownText(element) || undefined;
    const value = field && !toggles ? field.value || undefined : undefined;
    const checked = toggles ? input!.checked : undefined;
    const meaningful = !!(role || name || text || value);
    // Only levels that say something count toward depth; layout wrappers are free.
    const below = meaningful ? depth - 1 : depth;
    const children =
      below >= 0 && tag !== 'svg'
        ? [...element.children].flatMap((child) => read(child, below, options))
        : [];
    if (!meaningful && tag !== 'svg') {
      // A wrapper with nothing of its own is its children when it adds no box of its own.
      if (children.length === 0) return [];
      if (children.length === 1 && sameRect(children[0].rect, rect)) return children;
    }
    const described: AgentElement = { id: idOf(element), tag, rect: round(rect) };
    if (role ?? tag === 'svg') described.role = role ?? 'img';
    if (name) described.name = name;
    if (text) described.text = text;
    if (value) described.value = value;
    if (checked !== undefined) described.checked = checked;
    if (children.length) described.children = children;
    return [described];
  };

  return {
    /** What is in `rect` (default: the view), node by node, as plain JSON. */
    describe(options: DescribeOptions = {}): AgentElement[] {
      const area =
        options.rect ??
        visibleWorldRect(
          canvas.getCamera(),
          canvas.surface.clientWidth,
          canvas.surface.clientHeight,
        );
      return canvas.getNodesIn(area).flatMap((node) => read(node, options.depth ?? 6, options));
    },

    /** The element behind an id from `describe`, or null once it is gone. */
    element(id: string): Element | null {
      const element = elements.get(id)?.deref();
      return element?.isConnected ? element : null;
    },

    /** Where an element (or the element behind an id) sits, in world units. */
    rect(target: string | Element): Rect | null {
      const element = typeof target === 'string' ? this.element(target) : target;
      return element ? canvas.getElementRect(element) : null;
    },

    /**
     * An image of a world rect (an element's box when given one) as the nodes look now, at
     * `scale` texels per world unit. GPU backend only.
     */
    async capture(
      target: Rect | string | Element,
      { scale = 1, background }: { scale?: number; background?: string } = {},
    ): Promise<ImageData> {
      const area = typeof target === 'object' && 'width' in target ? target : this.rect(target);
      if (!area) throw new Error('Nothing to capture');
      // Large regions come back smaller rather than failing.
      const fit = Math.min(scale, 8192 / area.width, 8192 / area.height);
      const width = Math.max(1, Math.round(area.width * fit));
      const height = Math.max(1, Math.round(area.height * fit));
      const out = new OffscreenCanvas(width, height);
      const context = out.getContext('2d')!;
      if (background) {
        context.fillStyle = background;
        context.fillRect(0, 0, width, height);
      }
      const nodes = canvas.getNodesIn(area);
      const images = await Promise.all(nodes.map((node) => canvas.snapshot(node, { scale: fit })));
      // In paint order, so nodes on top cover the ones below.
      nodes.forEach((node, i) => {
        const rect = canvas.getNodeRect(node)!;
        const bitmap = new OffscreenCanvas(images[i].width, images[i].height);
        bitmap.getContext('2d')!.putImageData(images[i], 0, 0);
        context.drawImage(bitmap, (rect.x - area.x) * fit, (rect.y - area.y) * fit);
      });
      return context.getImageData(0, 0, width, height);
    },
  };
}

export type AgentView = ReturnType<typeof createAgentView>;
