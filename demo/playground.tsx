import { memo, type ReactNode } from 'react';
import { Avatar } from './ui';
import type { Rect } from '../src/index';
import { CanvasNode } from '../src/react';
import { KINDS, type KindName } from './items';
import { PRODUCTS, type Product } from './products';
import { DESKTOP_SIZE, layoutsFor, PHONE_SIZE, renderScreen, screenName } from './screens';
import { nodeClass } from './bench';

/**
 * The playground: a studio's working canvas. Each cluster is one product's screens (its web app,
 * a mobile flow, a few explorations) or a moodboard or retro wall, sitting where people dropped
 * it, in loose columns with stickies, comments and arrows around. A seeded generator lays it out, so
 * every load, and both modes of the benchmark, see the same canvas.
 */
export interface Item {
  rect: Rect;
  render: () => ReactNode;
  /** A desktop or phone product screen, as opposed to a note, comment or other annotation. */
  screen?: boolean;
  /** A screen's caption, like `Tempo / Web / Sign in`. */
  name?: string;
}

export interface Cluster {
  items: Item[];
  bounds: Rect;
}

type Column = string[];
interface Template {
  weight: number;
  /** The cluster's title and columns, drawn fresh for every copy. */
  build: (next: () => number, product: Product) => { title: string; columns: Column[] };
}

/** Kinds that come and go between copies of a template, as loose annotations do. */
const OPTIONAL = new Set<string>(['sticky', 'comment', 'note', 'arrow', 'toast', 'menu']);
const HEADER = '#';
/** `desktop:Layout` and `phone:Layout` name a product screen. */
const SCREEN = /^(desktop|phone):(.+)$/;

const choose = <T,>(next: () => number, list: readonly T[]) =>
  list[Math.floor(next() * list.length)];

/** `count` different entries of `list`, in random order. */
function draw<T>(next: () => number, list: readonly T[], count: number) {
  const pool = [...list];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, count);
}

const desktops = (next: () => number, product: Product, count: number) =>
  draw(next, layoutsFor('desktop', product), count).map((layout) => `desktop:${layout}`);
const phones = (next: () => number, product: Product, count: number) =>
  draw(next, layoutsFor('phone', product), count).map((layout) => `phone:${layout}`);
/** Phones in a row with arrows between them, the way a flow is laid out. */
const flow = (screens: string[]) =>
  screens.flatMap((screen, i) => (i ? [['arrow'], [screen]] : [[screen]]));
const notes = (next: () => number) =>
  draw(next, ['sticky', 'comment', 'note', 'sticky', 'toast', 'menu'], 3);

const TEMPLATES: Template[] = [
  {
    // A product's web app next to its mobile app.
    weight: 4,
    build: (next, product) => {
      const [top, bottom] = desktops(next, product, 2);
      return {
        title: `${product.name} ${choose(next, ['web and iOS', 'v2', 'redesign', 'round 3', 'Q3 launch'])}`,
        columns: [
          [top, bottom],
          notes(next),
          ...flow(phones(next, product, 2 + Math.floor(next() * 2))),
          ['sticky', 'comment'],
        ],
      };
    },
  },
  {
    // A mobile flow, screen by screen.
    weight: 4,
    build: (next, product) => ({
      title: `${product.name} ${choose(next, ['iOS', 'mobile flow', 'app, first run', 'app v4', 'checkout flow'])}`,
      columns: [
        ...flow(phones(next, product, 3 + Math.floor(next() * 2))),
        ['sticky', 'comment', 'sticky'],
      ],
    }),
  },
  {
    // Desktop explorations, side by side.
    weight: 3,
    build: (next, product) => {
      const [a, b, c] = desktops(next, product, 3);
      return {
        title: `${product.name} ${choose(next, ['website', 'dashboard explorations', 'marketing site', 'admin'])}`,
        columns: [[a, b], notes(next), [c], ['sticky', 'note']],
      };
    },
  },
  {
    weight: 2,
    build: (next) => ({
      title: choose(next, ['Moodboard', 'Campaign visuals', 'Brand refresh', 'Photo picks']),
      columns: [
        ['photo', 'portrait'],
        ['portrait', 'swatches', 'sticky'],
        ['photo', 'photo', 'type'],
        ['sticky', 'note'],
      ],
    }),
  },
  {
    weight: 2,
    build: (next) => ({
      title: `Retro, sprint ${40 + Math.floor(next() * 20)}`,
      columns: [
        [`${HEADER}Went well`, 'retro', 'retro', 'retro', 'retro'],
        [`${HEADER}To improve`, 'retro', 'retro', 'retro'],
        [`${HEADER}Try next`, 'retro', 'retro', 'retro', 'retro'],
        ['comment', 'sticky'],
      ],
    }),
  },
];

const TOTAL_WEIGHT = TEMPLATES.reduce((sum, template) => sum + template.weight, 0);
const AUTHORS = [
  ['Ann', '/avatars/ann-press.webp'],
  ['Livia', '/avatars/livia-saris.webp'],
  ['Jaydon', '/avatars/jaydon-aminoff.webp'],
  ['Maria', '/avatars/maria-lubin.webp'],
  ['Kianna', '/avatars/kianna-vaccaro.webp'],
] as const;

/** mulberry32: small, fast and the same on every engine. */
function random(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function Title({ text, variant }: { text: string; variant: number }) {
  const [author, src] = AUTHORS[variant % AUTHORS.length];
  return (
    <div className="flex h-full items-center gap-3">
      <span className="text-display-4-semibold text-text-primary">{text}</span>
      <Avatar size="xs" src={src} alt={author} />
      <span className="text-body-regular text-text-tertiary">
        Edited {(variant % 11) + 1}h ago by {author}
      </span>
    </div>
  );
}

function Header({ text }: { text: string }) {
  return <span className="text-title-3-semibold text-text-secondary">{text}</span>;
}

function buildCluster(next: () => number, product: Product): Item[] {
  let roll = next() * TOTAL_WEIGHT;
  const template = TEMPLATES.find((candidate) => (roll -= candidate.weight) < 0) ?? TEMPLATES[0];
  const variant = Math.floor(next() * 1000);
  const { title, columns } = template.build(next, product);
  const items: Item[] = [
    {
      rect: { x: 0, y: 0, width: 760, height: 56 },
      render: () => <Title text={title} variant={variant} />,
    },
  ];
  let x = Math.round(next() * 40);
  let notesOnWall = 0;
  for (const column of columns) {
    // An arrow column points from one screen to the next, about halfway down the screens.
    const connector = column.length === 1 && column[0] === 'arrow';
    let y = connector ? 420 + Math.round(next() * 60) : 96 + Math.round(next() * 40);
    let width = 0;
    for (const name of column) {
      if (OPTIONAL.has(name) && !connector && next() < 0.3) continue;
      // Notes on one wall never repeat; everything else picks its copy freely.
      const v =
        name === 'sticky' || name === 'retro' ? variant + notesOnWall++ : Math.floor(next() * 1000);
      const offset = Math.round(next() * 12);
      if (name.startsWith(HEADER)) {
        const text = name.slice(HEADER.length);
        items.push({
          rect: { x, y, width: 196, height: 32 },
          render: () => <Header text={text} />,
        });
        y += 44;
        width = Math.max(width, 196);
        continue;
      }
      const screen = SCREEN.exec(name);
      const kind = screen
        ? {
            ...(screen[1] === 'desktop' ? DESKTOP_SIZE : PHONE_SIZE),
            render: (seed: number) =>
              renderScreen(screen[1] as 'desktop' | 'phone', screen[2], product, seed),
          }
        : KINDS[name as KindName];
      items.push({
        rect: { x: x + offset, y, width: kind.width, height: kind.height },
        render: () => kind.render(v),
        screen: !!screen,
        name: screen ? screenName(screen[1] as 'desktop' | 'phone', screen[2], product) : undefined,
      });
      y += kind.height + 20 + Math.round(next() * 16);
      width = Math.max(width, kind.width + offset);
    }
    if (width > 0) x += width + 32 + Math.round(next() * 24);
  }
  return items;
}

function boundsOf(items: Item[]): Rect {
  let right = 0;
  let bottom = 0;
  for (const { rect } of items) {
    right = Math.max(right, rect.x + rect.width);
    bottom = Math.max(bottom, rect.y + rect.height);
  }
  return { x: 0, y: 0, width: right, height: bottom };
}

/**
 * Exactly `nodes` items in clusters, packed the way a busy canvas grows: each cluster takes the
 * free spot against an earlier one that is nearest the middle, with its own small margin, so the
 * whole is a dense, uneven block. Clusters come back center first, the order they mount.
 */
export function buildPlayground(nodes: number, seed = 7): { clusters: Cluster[]; bounds: Rect } {
  const next = random(seed);
  const local: Item[][] = [];
  // Products come from a shuffled deck, so all of them show up before any comes back.
  let deck: Product[] = [];
  let count = 0;
  while (count < nodes) {
    if (!deck.length) deck = draw(next, PRODUCTS, PRODUCTS.length);
    const items = buildCluster(next, deck.pop()!).slice(0, nodes - count);
    local.push(items);
    count += items.length;
  }

  // A coarse grid of placed rects keeps the overlap test cheap.
  const CELL = 2048;
  const grid = new Map<string, Rect[]>();
  const cells = (rect: Rect, visit: (key: string) => boolean | void) => {
    for (let cx = Math.floor(rect.x / CELL); cx <= Math.floor((rect.x + rect.width) / CELL); cx++) {
      for (
        let cy = Math.floor(rect.y / CELL);
        cy <= Math.floor((rect.y + rect.height) / CELL);
        cy++
      ) {
        if (visit(`${cx},${cy}`)) return true;
      }
    }
    return false;
  };
  const free = (rect: Rect) =>
    !cells(rect, (key) =>
      grid
        .get(key)
        ?.some(
          (other) =>
            rect.x < other.x + other.width &&
            other.x < rect.x + rect.width &&
            rect.y < other.y + other.height &&
            other.y < rect.y + rect.height,
        ),
    );

  const clusters: Cluster[] = [];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const placedRects: Rect[] = [];
  for (const items of local) {
    const size = boundsOf(items);
    const margin = 32 + Math.round(next() * 48);
    const width = size.width + margin * 2;
    const height = size.height + margin * 2;
    // Spots that touch a placed cluster: beside it, top or bottom aligned, or under it, left or
    // right aligned. The first cluster sits at the middle.
    const candidates: [number, number][] = placedRects.length ? [] : [[-width / 2, -height / 2]];
    for (const r of placedRects) {
      const rightX = r.x + r.width;
      const bottomY = r.y + r.height;
      candidates.push(
        [rightX, r.y],
        [rightX, bottomY - height],
        [r.x - width, r.y],
        [r.x - width, bottomY - height],
        [r.x, bottomY],
        [rightX - width, bottomY],
        [r.x, r.y - height],
        [rightX - width, r.y - height],
      );
    }
    let best: Rect | null = null;
    let bestDistance = Infinity;
    for (const [x, y] of candidates) {
      const rect = { x: Math.round(x), y: Math.round(y), width, height };
      // Wider than tall, like the screen it is seen on.
      const distance = Math.hypot((rect.x + width / 2) / 1.4, rect.y + height / 2);
      if (distance < bestDistance && free(rect)) {
        best = rect;
        bestDistance = distance;
      }
    }
    const placed = best!;
    placedRects.push(placed);
    cells(placed, (key) => {
      const list = grid.get(key);
      if (list) list.push(placed);
      else grid.set(key, [placed]);
    });
    const origin = { x: placed.x + margin, y: placed.y + margin };
    clusters.push({
      items: items.map((item) => ({
        ...item,
        rect: { ...item.rect, x: item.rect.x + origin.x, y: item.rect.y + origin.y },
      })),
      bounds: { ...origin, width: size.width, height: size.height },
    });
    minX = Math.min(minX, origin.x);
    minY = Math.min(minY, origin.y);
    maxX = Math.max(maxX, origin.x + size.width);
    maxY = Math.max(maxY, origin.y + size.height);
  }
  return { clusters, bounds: { x: minX, y: minY, width: maxX - minX, height: maxY - minY } };
}

/** Cluster `id`'s nodes; each carries `nodeClass(id, index)` so the bench can find it. */
/** Whether a screen at `rect` opens blank, for the agents to build: it is in the opening view. */
const inView = (rect: Rect, view: Rect | null) =>
  !!view &&
  rect.x < view.x + view.width &&
  rect.x + rect.width > view.x &&
  rect.y < view.y + view.height &&
  rect.y + rect.height > view.y;

export const ClusterNodes = memo(function ClusterNodes({
  cluster,
  id,
  blank = null,
}: {
  cluster: Cluster;
  id: number;
  /** Screens in this rect start blank until an agent builds them. */
  blank?: Rect | null;
}) {
  return (
    <>
      {cluster.items.map((item, index) => (
        <CanvasNode
          key={index}
          {...item.rect}
          className={
            item.screen && inView(item.rect, blank)
              ? `${nodeClass(id, index)} agent-blank`
              : nodeClass(id, index)
          }
        >
          {item.render()}
        </CanvasNode>
      ))}
    </>
  );
});
