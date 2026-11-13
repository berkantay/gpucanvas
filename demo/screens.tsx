import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import {
  RiAddLine,
  RiAppleFill,
  RiArrowLeftSLine,
  RiArrowRightLine,
  RiArrowUpLine,
  RiBookmarkLine,
  RiCalendarLine,
  RiCheckLine,
  RiCompass3Line,
  RiDownloadLine,
  RiFilter3Line,
  RiHeartFill,
  RiHeartLine,
  RiHome5Line,
  RiMapPin2Line,
  RiMessage3Line,
  RiMore2Line,
  RiPauseFill,
  RiPlayFill,
  RiSearchLine,
  RiSendPlaneFill,
  RiShareLine,
  RiSkipBackFill,
  RiSkipForwardFill,
  RiStarFill,
  RiUser3Line,
} from '@remixicon/react';
import {
  Avatar,
  Badge,
  Breadcrumb,
  BreadcrumbItem,
  Button,
  Checkbox,
  Chip,
  cx,
  Divider,
  flow,
  IconButton,
  Input,
  MenuButton,
  MonthCalendar,
  Notification,
  NotificationsButton,
  SegmentedControl,
  SegmentedControlItem,
  Select,
  SelectItem,
  SignInCard,
  Switch,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableHeader,
  TableRow,
  TabList,
  Tabs,
  Textarea,
  Thinking,
  toast,
  useToasts,
  type Day,
} from './ui';
import { PEOPLE, type Entry, type Product } from './products';

/**
 * Product screens made of the demo's own components (ui.tsx), the way they sit on a design canvas: the
 * frame's name above a framed screen. A layout takes a product and a seed, so every cluster
 * shows its own brand, copy and numbers. Every screen is one canvas node and fully interactive.
 */
export const DESKTOP = { width: 1440, height: 900 };
export const PHONE = { width: 402, height: 874 };
/** Room above the frame for its name. */
export const LABEL = 30;
/**
 * Room around the frame for its shadow. A node's snapshot ends at its box, so anything that
 * should show, shadows included, stays inside it.
 */
export const BLEED = 28;

type Props = { product: Product; seed: number };

/* ----- Small shared pieces ------------------------------------------------------------------ */

/** A seeded series, smooth enough to read as real data. */
function series(seed: number, count: number) {
  let value = 40 + (seed % 30);
  return Array.from({ length: count }, (_, i) => {
    value += Math.sin(seed * 0.7 + i * 0.9) * 9 + ((seed * (i + 3)) % 7) - 2.6;
    return Math.max(8, Math.min(96, value));
  });
}

/** `list` rotated by the seed, so the same entries come in a different order per screen. */
const rotate = <T,>(list: readonly T[], seed: number) => {
  const start = seed % list.length;
  return [...list.slice(start), ...list.slice(0, start)];
};

function Logo({ product, size = 'md' }: { product: Product; size?: 'sm' | 'md' | 'lg' }) {
  const Icon = product.icon;
  return (
    <span className="flex items-center gap-2">
      <span
        className={cx(
          'flex items-center justify-center rounded-xl bg-accent-500 text-white shadow-sm',
          size === 'sm' ? 'size-7' : size === 'md' ? 'size-9' : 'size-14 rounded-2xl',
        )}
      >
        <Icon className={size === 'lg' ? 'size-8' : 'size-5'} />
      </span>
      {size !== 'lg' && (
        <span className="text-headline-semibold text-text-primary">{product.name}</span>
      )}
    </span>
  );
}

/** Lines morph from one range to the next. */
const MORPH: CSSProperties = { transition: 'd 700ms cubic-bezier(0.2, 0.8, 0.2, 1)' };

function AreaChart({
  seed,
  shift = 0,
  height = 220,
}: {
  seed: number;
  shift?: number;
  height?: number;
}) {
  const data = series(seed + shift, 24);
  const previous = series(seed + shift + 11, 24).map((v) => v * 0.8);
  const path = (values: number[]) =>
    values
      .map((v, i) => `${i === 0 ? 'M' : 'L'}${(i / (values.length - 1)) * 100} ${100 - v}`)
      .join(' ');
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full" style={{ height }}>
      <defs>
        <linearGradient id={`fill-${seed}`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="var(--color-accent-500)" stopOpacity="0.28" />
          <stop offset="1" stopColor="var(--color-accent-500)" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[25, 50, 75].map((y) => (
        <line
          key={y}
          x1="0"
          x2="100"
          y1={y}
          y2={y}
          stroke="var(--color-border-button-default)"
          strokeWidth="0.4"
          vectorEffect="non-scaling-stroke"
        />
      ))}
      <path d={`${path(data)} L100 100 L0 100 Z`} fill={`url(#fill-${seed})`} style={MORPH} />
      <path
        style={MORPH}
        d={path(previous)}
        fill="none"
        stroke="var(--color-text-tertiary)"
        strokeDasharray="3 3"
        strokeWidth="1.2"
        vectorEffect="non-scaling-stroke"
      />
      <path
        style={MORPH}
        d={path(data)}
        fill="none"
        stroke="var(--color-accent-500)"
        strokeWidth="2.2"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

function Bars({
  seed,
  count = 12,
  height = 160,
}: {
  seed: number;
  count?: number;
  height?: number;
}) {
  const data = series(seed, count);
  return (
    <div className="flex items-end gap-2" style={{ height }}>
      {data.map((v, i) => (
        <div
          key={i}
          className={cx(
            'flex-1 rounded-t-md',
            i === count - 1 ? 'bg-accent-500' : 'bg-accent-200 dark:bg-accent-800',
          )}
          style={{ height: `${v}%` }}
        />
      ))}
    </div>
  );
}

function Ring({ value, size = 140, label }: { value: number; size?: number; label: string }) {
  const r = 42;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg viewBox="0 0 100 100" className="size-full -rotate-90">
        <circle
          cx="50"
          cy="50"
          r={r}
          fill="none"
          stroke="var(--color-background-tertiary-default)"
          strokeWidth="10"
        />
        <circle
          cx="50"
          cy="50"
          r={r}
          fill="none"
          stroke="var(--color-accent-500)"
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={`${(c * value) / 100} ${c}`}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-title-2-semibold text-text-primary">{value}%</span>
        <span className="text-caption-1-regular text-text-tertiary">{label}</span>
      </div>
    </div>
  );
}

function Kpi({ label, value, delta }: { label: string; value: string; delta: string }) {
  const down = delta.startsWith('-');
  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-border-button-default bg-background-primary-default p-4">
      <span className="text-body-2-medium text-text-tertiary">{label}</span>
      <span className="text-title-1-semibold text-text-primary">{value}</span>
      <span
        className={cx('text-caption-1-medium', down ? 'text-text-tertiary' : 'text-accent-600')}
      >
        {delta}
      </span>
    </div>
  );
}

function Status({ entry }: { entry: Entry }) {
  return (
    <Chip color={entry.tone} variant="subtle">
      {entry.status}
    </Chip>
  );
}

/** Downloads `entries` as a CSV file, the way an Export button would. */
function downloadCsv(name: string, entries: Entry[]) {
  const rows = [
    ['Name', 'Details', 'Status', 'Value'],
    ...entries.map((e) => [e.title, e.sub, e.status, e.value]),
  ];
  const csv = rows
    .map((row) => row.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(','))
    .join('\n');
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  link.download = `${name.toLowerCase().replaceAll(' ', '-')}.csv`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

/** The bell's latest few, from the product's own entries. */
const notificationsOf = (product: Product, seed: number) =>
  rotate(product.entries, seed + 1)
    .slice(0, 4)
    .map((entry, i) => ({
      title: `${entry.title}: ${entry.status.toLowerCase()}`,
      description: entry.sub,
      time: `${(i + 1) * 7}m`,
    }));

/** A cover from the product's pictures, or a brand gradient when it runs out. */
function Cover({
  product,
  seed,
  className,
  style,
}: Props & { className?: string; style?: CSSProperties }) {
  const src = product.images[seed % (product.images.length + 1)];
  return src ? (
    <img
      src={src}
      alt=""
      draggable={false}
      className={cx('object-cover', className)}
      style={style}
    />
  ) : (
    <div
      className={cx('flex items-center justify-center overflow-hidden', className)}
      style={{
        background: `radial-gradient(circle at ${20 + (seed % 60)}% 30%, var(--color-accent-300), transparent 60%), linear-gradient(135deg, var(--color-accent-500), var(--color-accent-800))`,
        ...style,
      }}
    >
      <product.icon
        className="size-1/2 max-h-48 max-w-48 text-white/20"
        style={{ rotate: `${(seed % 5) * 6 - 12}deg` }}
      />
    </div>
  );
}

/* ----- Desktop chrome ----------------------------------------------------------------------- */

function Sidebar({ product, active = 0 }: { product: Product; active?: number }) {
  const [name, src] = PEOPLE[product.name.length % PEOPLE.length];
  return (
    <aside className="flex w-[232px] shrink-0 flex-col gap-1 border-e border-border-button-default bg-background-secondary-default p-4">
      <div className="mb-5 px-2">
        <Logo product={product} />
      </div>
      <div className="mb-3">
        <Input placeholder="Search" leadingIcon={RiSearchLine} />
      </div>
      {product.nav.map((item, index) => (
        <span
          key={item}
          className={cx(
            'rounded-xl px-3 py-2 text-body-medium',
            index === active
              ? 'bg-background-primary-default text-text-primary shadow-card'
              : 'text-text-secondary',
          )}
        >
          {item}
        </span>
      ))}
      <div className="mt-auto flex items-center gap-2 rounded-xl p-2">
        <Avatar size="sm" src={src} alt={name} />
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-body-2-medium text-text-primary">{name}</span>
          <span className="truncate text-caption-1-regular text-text-tertiary">
            {product.name} team
          </span>
        </div>
      </div>
    </aside>
  );
}

function AppPage({
  product,
  active,
  title,
  actions,
  children,
}: {
  product: Product;
  active: number;
  title: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex h-full">
      <Sidebar product={product} active={active} />
      <main className="flex min-w-0 flex-1 flex-col gap-6 overflow-hidden p-8">
        <header className="flex items-center gap-4">
          <div className="flex flex-col gap-1">
            <Breadcrumb>
              <BreadcrumbItem href="#">{product.name}</BreadcrumbItem>
              <BreadcrumbItem current>{product.nav[active]}</BreadcrumbItem>
            </Breadcrumb>
            <h1 className="text-title-1-semibold text-text-primary">{title}</h1>
          </div>
          <div className="ms-auto flex items-center gap-2">
            {actions}
            <NotificationsButton items={notificationsOf(product, active)} />
          </div>
        </header>
        {children}
      </main>
    </div>
  );
}

/* ----- Desktop screens ---------------------------------------------------------------------- */

/** How each range scales the 30 day numbers, and where its series starts. */
const RANGES: Record<string, { factor: number; shift: number; compare: string }> = {
  '7d': { factor: 0.23, shift: 5, compare: 'This week vs. last' },
  '30d': { factor: 1, shift: 0, compare: 'This period vs. last' },
  '12m': { factor: 11.6, shift: 23, compare: 'This year vs. last' },
};

/** `value` with its number scaled, so `$3,214` reads `$37,282` over a year. Rates stay. */
const scaled = (value: string, factor: number) =>
  value.includes('%') || factor === 1
    ? value
    : value.replace(/[\d,]+(\.\d+)?/, (n) => {
        const scaledNumber = parseFloat(n.replace(/,/g, '')) * factor;
        return n.includes('.')
          ? scaledNumber.toLocaleString('en-US', {
              minimumFractionDigits: 1,
              maximumFractionDigits: 1,
            })
          : Math.round(scaledNumber).toLocaleString('en-US');
      });

function Dashboard({ product, seed }: Props) {
  const [range, setRange] = useState(new Set(['30d']));
  const current = RANGES[[...range][0]] ?? RANGES['30d'];
  const [name] = PEOPLE[seed % PEOPLE.length];
  return (
    <AppPage
      product={product}
      active={0}
      title={`Good ${seed % 2 ? 'afternoon' : 'morning'}, ${name.split(' ')[0]}`}
      actions={
        <SegmentedControl
          selectedKeys={range}
          onSelectionChange={(keys) => setRange(new Set(keys as Set<string>))}
          aria-label="Range"
        >
          <SegmentedControlItem id="7d">7 days</SegmentedControlItem>
          <SegmentedControlItem id="30d">30 days</SegmentedControlItem>
          <SegmentedControlItem id="12m">12 months</SegmentedControlItem>
        </SegmentedControl>
      }
    >
      <div className="grid grid-cols-4 gap-4">
        {product.kpis.map(([label, value, delta]) => (
          <Kpi key={label} label={label} value={scaled(value, current.factor)} delta={delta} />
        ))}
      </div>
      <div className="grid grid-cols-[1fr_340px] gap-4">
        <div className="flex flex-col gap-3 rounded-2xl border border-border-button-default p-5">
          <div className="flex items-center justify-between">
            <span className="text-headline-semibold text-text-primary">{product.kpis[0][0]}</span>
            <span className="text-body-2-regular text-text-tertiary">{current.compare}</span>
          </div>
          <AreaChart seed={seed} shift={current.shift} height={420} />
        </div>
        <div className="flex flex-col gap-3 rounded-2xl border border-border-button-default p-5">
          <span className="text-headline-semibold text-text-primary">
            Recent {product.things.toLowerCase()}
          </span>
          {rotate(product.entries, seed)
            .slice(0, 8)
            .map((entry) => (
              <div
                key={entry.title}
                className="flex items-center gap-3 border-b border-border-button-default pb-3 last:border-0"
              >
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-body-2-medium text-text-primary">
                    {entry.title}
                  </span>
                  <span className="truncate text-caption-1-regular text-text-tertiary">
                    {entry.sub}
                  </span>
                </div>
                <span className="text-body-2-medium text-text-primary">{entry.value}</span>
              </div>
            ))}
        </div>
      </div>
    </AppPage>
  );
}

function ListPage({ product, seed }: Props) {
  const [entries, setEntries] = useState(() => rotate(product.entries, seed));
  const [status, setStatus] = useState<string | null>(null);
  const statuses = [...new Set(entries.map((entry) => entry.status))];
  const shown = status ? entries.filter((entry) => entry.status === status) : entries;
  return (
    <AppPage
      product={product}
      active={1}
      title={product.things}
      actions={
        <>
          <Button
            variant="secondary"
            leadingIcon={RiDownloadLine}
            onClick={(event) => {
              downloadCsv(product.things, shown);
              toast(event.currentTarget, `Exported ${shown.length} rows`);
            }}
          >
            Export
          </Button>
          <Button
            leadingIcon={RiAddLine}
            onClick={() => {
              setStatus(null);
              setEntries((all) => [
                {
                  title: `Untitled ${all.length - product.entries.length + 1}`,
                  sub: 'Just now',
                  value: '-',
                  status: 'Draft',
                  tone: 'gray',
                },
                ...all,
              ]);
            }}
          >
            New
          </Button>
        </>
      }
    >
      <div className="flex items-center justify-between">
        <Tabs defaultSelectedKey="all">
          <TabList aria-label={product.things}>
            <Tab id="all" count={entries.length * 6 + (seed % 9)}>
              All
            </Tab>
            <Tab id="mine" count={entries.length}>
              Mine
            </Tab>
            <Tab id="archived">Archived</Tab>
          </TabList>
        </Tabs>
        <div className="flex shrink-0 gap-2">
          <Input
            placeholder={`Search ${product.things.toLowerCase()}`}
            leadingIcon={RiSearchLine}
          />
          <MenuButton
            icon={RiFilter3Line}
            aria-label="Filter by status"
            items={[null, ...statuses].map((value) => ({
              label: value ?? 'All statuses',
              selected: value === status,
              onSelect: () => setStatus(value),
            }))}
          />
        </div>
      </div>
      <Table aria-label={product.things}>
        <TableHeader>
          <TableColumn id="name" isRowHeader>
            Name
          </TableColumn>
          <TableColumn id="detail">Details</TableColumn>
          <TableColumn id="owner">Owner</TableColumn>
          <TableColumn id="status">Status</TableColumn>
          <TableColumn id="value">Value</TableColumn>
        </TableHeader>
        <TableBody>
          {shown.map((entry, index) => {
            const [name, src] = PEOPLE[(seed + index) % PEOPLE.length];
            return (
              <TableRow key={entry.title} id={entry.title}>
                <TableCell>
                  <span className="text-body-medium text-text-primary">{entry.title}</span>
                </TableCell>
                <TableCell>{entry.sub}</TableCell>
                <TableCell>
                  <span className="flex items-center gap-2">
                    <Avatar size="xs" src={src} alt={name} />
                    {name}
                  </span>
                </TableCell>
                <TableCell>
                  <Status entry={entry} />
                </TableCell>
                <TableCell>{entry.value}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </AppPage>
  );
}

const COLUMNS = ['To do', 'In progress', 'Review', 'Done'];
/** Cards "Add card" puts in To do, in order. */
const NEW_CARDS = [
  'Polish onboarding',
  'Fix sync on resume',
  'Ship release notes',
  'Audit contrast',
];

/** A board whose cards move on a click: each click takes a card one column to the right. */
function Board({ product, seed }: Props) {
  const [cards, setCards] = useState(() => {
    const entries = rotate(product.entries, seed);
    return COLUMNS.flatMap((_, c) =>
      entries.slice(c, c + 1 + ((seed + c) % 3)).map((entry, i) => ({
        id: `${c}-${i}`,
        title: entry.title,
        sub: entry.sub,
        entry,
        column: c,
        cover: (c + i + seed) % 4 === 0,
        person: PEOPLE[(c * 3 + i + seed) % PEOPLE.length],
      })),
    );
  });
  const advance = (id: string) =>
    setCards((all) => {
      const card = all.find((c) => c.id === id)!;
      if (card.column === COLUMNS.length - 1) return all;
      // A moved card lands on top of its next column.
      return [{ ...card, column: card.column + 1 }, ...all.filter((c) => c !== card)];
    });
  const add = () =>
    setCards((all) => {
      const added = all.filter((c) => c.id.startsWith('new')).length;
      const title = NEW_CARDS[added % NEW_CARDS.length];
      return [
        {
          ...all[0],
          id: `new-${added}`,
          title,
          sub: `Added just now`,
          column: 0,
          cover: false,
          person: PEOPLE[(seed + added) % PEOPLE.length],
        },
        ...all,
      ];
    });
  return (
    <AppPage
      product={product}
      active={2}
      title={`${product.things} board`}
      actions={
        <Button leadingIcon={RiAddLine} onClick={add}>
          Add card
        </Button>
      }
    >
      <div className="grid flex-1 grid-cols-4 gap-4 overflow-hidden">
        {COLUMNS.map((column, c) => {
          const here = cards.filter((card) => card.column === c);
          return (
            <div
              key={column}
              className="flex flex-col gap-3 overflow-hidden rounded-2xl bg-background-secondary-default p-3"
            >
              <div className="flex items-center gap-2 px-1">
                <span className="text-body-semibold text-text-primary">{column}</span>
                <Badge>{here.length}</Badge>
              </div>
              {here.map((card) => (
                <button
                  key={card.id}
                  data-act={`card ${card.id}`}
                  onClick={() => advance(card.id)}
                  className={cx(
                    'flex shrink-0 flex-col gap-3 rounded-xl bg-background-primary-default p-4 text-start shadow-card ring-1 ring-black/5 dark:ring-white/10',
                    card.id.startsWith('new') && 'ring-2 ring-accent-500',
                  )}
                >
                  {card.cover && (
                    <Cover
                      product={product}
                      seed={seed + Number(card.id.split('-')[0]) + Number(card.id.split('-')[1])}
                      className="h-24 w-full rounded-lg"
                    />
                  )}
                  <span className="text-body-medium text-text-primary">{card.title}</span>
                  <span className="text-body-2-regular text-text-tertiary">{card.sub}</span>
                  <div className="flex items-center justify-between">
                    {c === COLUMNS.length - 1 ? (
                      <Chip color="lime" variant="subtle">
                        Done
                      </Chip>
                    ) : (
                      <Status entry={card.entry} />
                    )}
                    <Avatar size="xs" src={card.person[1]} alt={card.person[0]} />
                  </div>
                </button>
              ))}
            </div>
          );
        })}
      </div>
    </AppPage>
  );
}

function Detail({ product, seed }: Props) {
  const entry = product.entries[seed % product.entries.length];
  const [saved, setSaved] = useState(false);
  return (
    <div className="flex h-full flex-col">
      <nav className="flex items-center gap-8 border-b border-border-button-default px-10 py-4">
        <Logo product={product} />
        {product.nav.slice(0, 4).map((item) => (
          <span key={item} className="text-body-medium text-text-secondary">
            {item}
          </span>
        ))}
        <div className="ms-auto flex gap-2">
          <Button variant="secondary" onClick={flow(1)}>
            Sign in
          </Button>
          <Button onClick={flow(1)}>Get started</Button>
        </div>
      </nav>
      <div className="grid flex-1 grid-cols-[1fr_380px] gap-10 p-10">
        <div className="flex flex-col gap-6">
          <div className="grid h-[420px] grid-cols-[2fr_1fr] gap-3">
            <div className="relative overflow-hidden rounded-2xl">
              <Cover product={product} seed={seed} className="absolute inset-0 size-full" />
            </div>
            <div className="grid min-h-0 grid-rows-2 gap-3">
              {[1, 2].map((i) => (
                <div key={i} className="relative overflow-hidden rounded-2xl">
                  <Cover product={product} seed={seed + i} className="absolute inset-0 size-full" />
                </div>
              ))}
            </div>
          </div>
          <div className="flex items-start gap-4">
            <div className="flex flex-col gap-2">
              <h1 className="text-display-4-semibold text-text-primary">{entry.title}</h1>
              <span className="flex items-center gap-2 text-body-regular text-text-secondary">
                <RiStarFill className="size-4 text-accent-500" /> 4.{(seed % 5) + 5} ({120 + seed}{' '}
                reviews), {entry.sub}
              </span>
            </div>
            <div className="ms-auto flex gap-2">
              <IconButton
                icon={RiShareLine}
                aria-label="Share"
                onClick={(event) => {
                  void navigator.clipboard?.writeText(location.href).catch(() => {});
                  toast(event.currentTarget, 'Link copied');
                }}
              />
              <IconButton
                icon={saved ? RiHeartFill : RiHeartLine}
                aria-label="Save"
                onClick={() => setSaved((v) => !v)}
              />
            </div>
          </div>
          <p className="max-w-[640px] text-body-regular text-text-secondary">
            {product.tagline}. {product.features.join('. ')}. Everything you need in one place,
            ready when you are.
          </p>
        </div>
        <div className="flex h-fit flex-col gap-4 rounded-2xl p-6 shadow-lg ring-1 ring-black/5 dark:ring-white/10">
          <div className="flex items-baseline justify-between">
            <span className="text-title-1-semibold text-text-primary">{entry.value}</span>
            <Status entry={entry} />
          </div>
          <Divider />
          {product.features.slice(0, 3).map((feature) => (
            <span
              key={feature}
              className="flex items-center gap-2 text-body-regular text-text-secondary"
            >
              <RiCheckLine className="size-4 text-accent-500" /> {feature}
            </span>
          ))}
          <Button onClick={flow(1)}>Continue</Button>
          <Button variant="secondary" leadingIcon={RiMessage3Line} onClick={flow(1)}>
            Ask a question
          </Button>
        </div>
      </div>
    </div>
  );
}

function Landing({ product, seed }: Props) {
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <nav className="flex items-center gap-8 px-12 py-5">
        <Logo product={product} />
        {['Product', 'Pricing', 'Customers', 'Blog'].map((item) => (
          <span key={item} className="text-body-medium text-text-secondary">
            {item}
          </span>
        ))}
        <div className="ms-auto flex gap-2">
          <Button variant="ghost" onClick={flow(1)}>
            Log in
          </Button>
          <Button onClick={flow(1)}>Start free</Button>
        </div>
      </nav>
      <section className="relative flex flex-col items-center gap-6 px-12 pt-14 text-center">
        <div
          className="absolute inset-x-0 top-0 -z-0 h-[520px] opacity-60"
          style={{
            background: 'radial-gradient(60% 60% at 50% 0%, var(--color-accent-200), transparent)',
          }}
        />
        <Badge className="relative">New: {product.features[seed % product.features.length]}</Badge>
        <h1 className="relative max-w-[860px] text-[64px] leading-[1.05] font-semibold tracking-tight text-text-primary">
          {product.tagline}
        </h1>
        <p className="relative max-w-[560px] text-title-3-regular text-text-secondary">
          {product.name} brings {product.features.slice(0, 2).join(' and ').toLowerCase()} together,
          so you spend less time on busywork.
        </p>
        <div className="relative flex gap-3">
          <Button trailingIcon={RiArrowRightLine} onClick={flow(1)}>
            Get started
          </Button>
          <Button variant="secondary" onClick={flow(1)}>
            Book a demo
          </Button>
        </div>
        <div className="relative mt-6 grid w-full max-w-[1100px] grid-cols-3 gap-4 text-start">
          {product.features.slice(0, 3).map((feature, i) => (
            <div
              key={feature}
              className="flex flex-col gap-3 rounded-2xl bg-background-primary-default p-5 shadow-md ring-1 ring-black/5 dark:ring-white/10"
            >
              <Cover product={product} seed={seed + i} className="h-36 w-full rounded-xl" />
              <span className="text-headline-semibold text-text-primary">{feature}</span>
              <span className="text-body-2-regular text-text-tertiary">
                Built for teams that move fast. Works on web, iOS and Android.
              </span>
            </div>
          ))}
        </div>
        <div className="relative mt-8 flex flex-col items-center gap-4">
          <span className="text-body-2-medium text-text-tertiary">Trusted by teams at</span>
          <div className="flex gap-12 text-title-3-semibold text-text-tertiary/70">
            {['Northwind', 'Acme', 'Globex', 'Initech', 'Umbrella', 'Hooli'].map((name) => (
              <span key={name}>{name}</span>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

function Pricing({ product, seed }: Props) {
  const [yearly, setYearly] = useState(new Set(['yearly']));
  const annual = yearly.has('yearly');
  const [plan, setPlan] = useState<number | null>(null);
  const tiers = [
    ['Starter', 0, 'For trying it out'],
    ['Pro', 12 + (seed % 8), 'For growing teams'],
    ['Business', 39 + (seed % 20), 'For larger organizations'],
  ] as const;
  return (
    <div className="flex h-full flex-col items-center gap-8 bg-background-secondary-default px-16 pt-14">
      <Logo product={product} />
      <div className="flex flex-col items-center gap-3 text-center">
        <h1 className="text-display-4-semibold text-text-primary">
          Simple pricing for {product.name}
        </h1>
        <p className="text-title-3-regular text-text-secondary">
          Start free. Upgrade when your team grows.
        </p>
      </div>
      <SegmentedControl
        selectedKeys={yearly}
        onSelectionChange={(keys) => setYearly(new Set(keys as Set<string>))}
        aria-label="Billing period"
      >
        <SegmentedControlItem id="monthly">Monthly</SegmentedControlItem>
        <SegmentedControlItem id="yearly">Yearly, 2 months free</SegmentedControlItem>
      </SegmentedControl>
      <div className="grid w-full max-w-[1100px] grid-cols-3 gap-5">
        {tiers.map(([name, price, blurb], i) => (
          <div
            key={name}
            className={cx(
              'flex flex-col gap-5 rounded-3xl bg-background-primary-default p-7 shadow-md ring-1',
              i === 1 ? 'ring-2 ring-accent-500' : 'ring-black/5 dark:ring-white/10',
            )}
          >
            <div className="flex items-center justify-between">
              <span className="text-title-3-semibold text-text-primary">{name}</span>
              {i === 1 && <Badge color="primary">Most popular</Badge>}
            </div>
            <span className="text-body-2-regular text-text-tertiary">{blurb}</span>
            <span className="text-[44px] leading-none font-semibold text-text-primary">
              ${annual ? Math.round(price * 0.83) : price}
              <span className="text-body-regular text-text-tertiary"> / seat / month</span>
            </span>
            <Button
              variant={i === 1 ? 'primary' : 'secondary'}
              leadingIcon={plan === i ? RiCheckLine : undefined}
              onClick={(event) => {
                setPlan(i);
                toast(event.currentTarget, `${name} plan selected`);
              }}
            >
              {plan === i ? 'Your plan' : i === 0 ? 'Start free' : `Choose ${name}`}
            </Button>
            <Divider />
            {product.features.slice(0, 2 + i).map((feature) => (
              <span
                key={feature}
                className="flex items-center gap-2 text-body-2-regular text-text-secondary"
              >
                <RiCheckLine className="size-4 text-accent-500" /> {feature}
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

const DAYS = ['Mon 9', 'Tue 10', 'Wed 11', 'Thu 12', 'Fri 13'];
/** What "New event" books, in order: a title and its free slot as [day, hour]. */
const NEW_EVENTS: [string, number, number][] = [
  ['Launch review', 2, 1],
  ['Design critique', 4, 4],
  ['Customer call', 0, 6],
  ['Team lunch', 3, 4],
  ['Roadmap sync', 1, 7],
];

/** A week whose free slots book on a click, and "New event" books the next one. */
function CalendarPage({ product, seed }: Props) {
  const entries = rotate(product.entries, seed);
  const [events, setEvents] = useState(() =>
    DAYS.flatMap((_, d) =>
      Array.from({ length: 9 }, (_, hour) => hour)
        .filter((hour) => (hour * 3 + d + seed) % 5 === 0)
        .map((hour) => {
          const entry = entries[(hour + d * 2) % entries.length];
          return { day: d, hour, title: entry.title, sub: entry.sub, added: false };
        }),
    ),
  );
  const at = (day: number, hour: number) => events.find((e) => e.day === day && e.hour === hour);
  const book = (day: number, hour: number, title: string) =>
    setEvents((all) =>
      all.some((e) => e.day === day && e.hour === hour)
        ? all
        : [...all, { day, hour, title, sub: `${hour + 8}:00 to ${hour + 9}:00`, added: true }],
    );
  const next = () => {
    const free = NEW_EVENTS.find(([, day, hour]) => !at(day, hour));
    if (free) book(free[1], free[2], free[0]);
  };
  return (
    <AppPage
      product={product}
      active={3}
      title="This week"
      actions={
        <Button leadingIcon={RiCalendarLine} onClick={next}>
          New event
        </Button>
      }
    >
      <div className="grid flex-1 grid-cols-[56px_repeat(5,1fr)] overflow-hidden rounded-2xl border border-border-button-default">
        <div />
        {DAYS.map((day) => (
          <div
            key={day}
            className="border-s border-border-button-default p-3 text-body-2-medium text-text-secondary"
          >
            {day}
          </div>
        ))}
        {Array.from({ length: 9 }, (_, hour) => (
          <div key={hour} className="contents">
            <div className="border-t border-border-button-default p-2 text-caption-1-regular text-text-tertiary">
              {hour + 8}:00
            </div>
            {DAYS.map((day, d) => {
              const event = at(d, hour);
              return (
                <div
                  key={day}
                  className="h-16 border-s border-t border-border-button-default p-1"
                  onClick={() => book(d, hour, 'New event')}
                >
                  {event && (
                    <div
                      className={cx(
                        'h-full rounded-lg border-s-4 border-accent-500 px-2 py-1',
                        event.added
                          ? 'bg-accent-500 text-white shadow-md'
                          : 'bg-accent-50 dark:bg-accent-950',
                      )}
                    >
                      <span
                        className={cx(
                          'block truncate text-caption-1-medium',
                          !event.added && 'text-text-primary',
                        )}
                      >
                        {event.title}
                      </span>
                      <span
                        className={cx(
                          'block truncate text-caption-1-regular',
                          event.added ? 'text-white/80' : 'text-text-tertiary',
                        )}
                      >
                        {event.sub}
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </AppPage>
  );
}

function SettingsPage({ product, seed }: Props) {
  const [name] = PEOPLE[seed % PEOPLE.length];
  const [photo, setPhoto] = useState(seed);
  const src = PEOPLE[photo % PEOPLE.length][1];
  const [toggles, setToggles] = useState([true, false, true]);
  return (
    <AppPage
      product={product}
      active={4}
      title="Settings"
      actions={
        <Button done="Saved" onClick={(event) => toast(event.currentTarget, 'Changes saved')}>
          Save changes
        </Button>
      }
    >
      <Tabs defaultSelectedKey="profile">
        <TabList aria-label="Settings">
          <Tab id="profile">Profile</Tab>
          <Tab id="notifications">Notifications</Tab>
          <Tab id="billing">Billing</Tab>
          <Tab id="security">Security</Tab>
        </TabList>
      </Tabs>
      <div className="grid max-w-[880px] grid-cols-[240px_1fr] gap-x-10 gap-y-8">
        <div className="flex flex-col gap-1">
          <span className="text-headline-semibold text-text-primary">Profile</span>
          <span className="text-body-2-regular text-text-tertiary">
            How others see you in {product.name}.
          </span>
        </div>
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-4">
            <img src={src} alt={name} className="size-16 rounded-full object-cover" />
            <Button variant="secondary" onClick={() => setPhoto((value) => value + 1)}>
              Change photo
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input label="Full name" defaultValue={name} />
            <Input
              label="Email"
              defaultValue={`${name.split(' ')[0].toLowerCase()}@${product.name.toLowerCase()}.com`}
            />
          </div>
          <Textarea label="Bio" defaultValue={`Working on ${product.name}. ${product.tagline}.`} />
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-headline-semibold text-text-primary">Notifications</span>
          <span className="text-body-2-regular text-text-tertiary">Choose what reaches you.</span>
        </div>
        <div className="flex flex-col divide-y divide-border-button-default rounded-2xl border border-border-button-default">
          {['Product updates', `New ${product.things.toLowerCase()}`, 'Weekly summary'].map(
            (label, i) => (
              <label
                key={label}
                className="flex items-center justify-between px-4 py-3.5 text-body-medium text-text-primary"
              >
                {label}
                <Switch
                  aria-label={label}
                  isSelected={toggles[i]}
                  onChange={(value) =>
                    setToggles((prev) => prev.map((item, j) => (j === i ? value : item)))
                  }
                />
              </label>
            ),
          )}
        </div>
      </div>
    </AppPage>
  );
}

function SignIn({ product, seed }: Props) {
  return (
    <div className="grid h-full grid-cols-2">
      <div className="flex flex-col p-10">
        <Logo product={product} />
        <div className="m-auto w-[400px]">
          <SignInCard
            mode={seed % 3 === 0 ? 'signup' : 'signin'}
            layout={seed % 2 ? 'stacked' : 'grid'}
            providers={['google', 'apple', 'github']}
            description={
              seed % 3 === 0 ? `Start with ${product.name} in a couple of minutes.` : undefined
            }
          />
        </div>
      </div>
      <div className="relative m-3 overflow-hidden rounded-3xl">
        <Cover product={product} seed={seed} className="absolute inset-0 size-full" />
        <div className="absolute inset-x-8 bottom-8 rounded-2xl bg-black/35 p-6 text-white backdrop-blur-md">
          <p className="text-title-3-medium">
            "{product.tagline}. We switched our whole team to {product.name} in a week."
          </p>
          <p className="mt-3 text-body-2-regular text-white/80">
            {PEOPLE[seed % PEOPLE.length][0]}
          </p>
        </div>
      </div>
    </div>
  );
}

function Analytics({ product, seed }: Props) {
  const entries = rotate(product.entries, seed);
  return (
    <AppPage
      product={product}
      active={4}
      title="Reports"
      actions={
        <Button
          variant="secondary"
          leadingIcon={RiDownloadLine}
          onClick={(event) => {
            downloadCsv(`${product.name} report`, entries);
            toast(event.currentTarget, 'Report downloaded');
          }}
        >
          Download
        </Button>
      }
    >
      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-2 flex flex-col gap-4 rounded-2xl border border-border-button-default p-5">
          <div className="flex items-center justify-between">
            <span className="text-headline-semibold text-text-primary">
              {product.kpis[1][0]}, by month
            </span>
            <Chip color="lime" variant="subtle">
              {product.kpis[1][2]}
            </Chip>
          </div>
          <Bars seed={seed} count={12} height={330} />
          <div className="flex justify-between text-caption-1-regular text-text-tertiary">
            {['Jan', 'Mar', 'May', 'Jul', 'Sep', 'Nov'].map((m) => (
              <span key={m}>{m}</span>
            ))}
          </div>
        </div>
        <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-border-button-default p-5">
          <Ring value={50 + (seed % 45)} size={220} label={product.kpis[2][0]} />
          <span className="text-body-2-regular text-text-tertiary">
            {product.kpis[2][1]} this period
          </span>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        {[0, 1].map((half) => (
          <div
            key={half}
            className="flex flex-col gap-3 rounded-2xl border border-border-button-default p-5"
          >
            <span className="text-headline-semibold text-text-primary">
              {half ? 'Rising' : 'Top'} {product.things.toLowerCase()}
            </span>
            {entries.slice(half * 3, half * 3 + 3).map((entry, i) => (
              <div key={entry.title} className="flex flex-col gap-1.5">
                <div className="flex justify-between text-body-2-medium">
                  <span className="text-text-primary">{entry.title}</span>
                  <span className="text-text-tertiary">{entry.value}</span>
                </div>
                <div className="h-1.5 rounded-full bg-background-tertiary-default">
                  <div
                    className="h-full rounded-full bg-accent-500"
                    style={{ width: `${90 - i * 22 - half * 10}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </AppPage>
  );
}

function Gallery({ product, seed }: Props) {
  const tiles = Array.from({ length: 9 }, (_, i) => i);
  const picker = useRef<HTMLInputElement>(null);
  const [uploads, setUploads] = useState<{ src: string; name: string }[]>([]);
  return (
    <AppPage
      product={product}
      active={2}
      title="Library"
      actions={
        <>
          <input
            ref={picker}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(event) => {
              const files = [...(event.target.files ?? [])];
              if (!files.length) return;
              setUploads((all) =>
                [
                  ...files.map((file) => ({ src: URL.createObjectURL(file), name: file.name })),
                  ...all,
                ].slice(0, tiles.length),
              );
              toast(
                event.target,
                files.length === 1
                  ? `Uploaded ${files[0].name}`
                  : `Uploaded ${files.length} images`,
              );
              event.target.value = '';
            }}
          />
          <Button leadingIcon={RiAddLine} onClick={() => picker.current?.click()}>
            Upload
          </Button>
        </>
      }
    >
      <div className="grid flex-1 grid-cols-4 grid-rows-3 gap-3">
        {tiles.map((i) => (
          <div
            key={i}
            className={cx(
              'group relative overflow-hidden rounded-2xl',
              i === 0 && 'col-span-2 row-span-2',
              i === 5 && 'col-span-2',
            )}
          >
            {uploads[i] ? (
              <img
                src={uploads[i].src}
                alt=""
                className="absolute inset-0 size-full object-cover"
              />
            ) : (
              <Cover product={product} seed={seed + i} className="absolute inset-0 size-full" />
            )}
            <span className="absolute bottom-2 left-2 rounded-lg bg-black/45 px-2 py-1 text-caption-1-medium text-white backdrop-blur">
              {uploads[i]?.name ?? product.entries[(seed + i) % product.entries.length].title}
            </span>
          </div>
        ))}
      </div>
    </AppPage>
  );
}

/** What the other side answers, in turn. */
const REPLIES = [
  'Love it. Sending the final files tonight.',
  'Works for me, see you then.',
  'Done, it is live now.',
];

const MINE =
  'ms-auto max-w-[60%] rounded-2xl rounded-br-md bg-accent-500 px-4 py-3 text-body-regular text-white';
const THEIRS =
  'max-w-[60%] rounded-2xl rounded-bl-md bg-background-secondary-default px-4 py-3 text-body-regular text-text-primary';

function Messages({ product, seed }: Props) {
  const threads = rotate(product.entries, seed).slice(0, 6);
  const [draft, setDraft] = useState('');
  const [sent, setSent] = useState<{ mine: boolean; text: string }[]>([]);
  const [typing, setTyping] = useState(true);
  const [name, src] = PEOPLE[(seed + 2) % PEOPLE.length];
  const send = () => {
    const text = draft.trim();
    if (!text) return;
    setSent((all) => [...all, { mine: true, text }]);
    setDraft('');
    setTyping(true);
    const replies = sent.filter((m) => !m.mine).length;
    setTimeout(() => {
      setTyping(false);
      setSent((all) => [...all, { mine: false, text: REPLIES[replies % REPLIES.length] }]);
    }, 1200);
  };
  return (
    <div className="flex h-full">
      <Sidebar product={product} active={3} />
      <div className="flex w-[340px] shrink-0 flex-col gap-1 border-e border-border-button-default p-4">
        <span className="mb-2 px-2 text-title-3-semibold text-text-primary">Messages</span>
        {threads.map((entry, i) => {
          const [person, avatar] = PEOPLE[(seed + i + 2) % PEOPLE.length];
          return (
            <div
              key={entry.title}
              className={cx(
                'flex gap-3 rounded-xl p-3',
                i === 0 && 'bg-accent-50 dark:bg-accent-950',
              )}
            >
              <Avatar size="sm" src={avatar} alt={person} />
              <div className="flex min-w-0 flex-col">
                <span className="text-body-2-medium text-text-primary">{person}</span>
                <span className="truncate text-caption-1-regular text-text-tertiary">
                  About {entry.title}
                </span>
              </div>
              {i < 2 && (
                <span className="ms-auto mt-1 size-2 shrink-0 rounded-full bg-accent-500" />
              )}
            </div>
          );
        })}
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-3 border-b border-border-button-default px-6 py-4">
          <Avatar size="md" src={src} alt={name} />
          <span className="text-body-semibold text-text-primary">{name}</span>
          <MenuButton
            className="ms-auto"
            icon={RiMore2Line}
            aria-label="More"
            items={[
              ['Mark as unread', 'Marked as unread'],
              ['Mute conversation', 'Conversation muted'],
              ['Archive', 'Conversation archived'],
            ].map(([label, done]) => ({ label, onSelect: (target) => toast(target, done) }))}
          />
        </div>
        <div className="flex min-h-0 flex-1 flex-col justify-end gap-3 overflow-hidden p-6">
          <div className="max-w-[60%] shrink-0 rounded-2xl rounded-bl-md bg-background-secondary-default px-4 py-3 text-body-regular text-text-primary">
            Hi, quick question about {threads[0].title}. Is it still{' '}
            {threads[0].status.toLowerCase()}?
          </div>
          <div className={cx(MINE, 'shrink-0')}>
            Yes, all set. I just shared the details with you.
          </div>
          <div className={cx(THEIRS, 'shrink-0')}>
            Perfect, thank you. {product.tagline}, indeed.
          </div>
          {sent.map((message, i) => (
            <div key={i} className={cx(message.mine ? MINE : THEIRS, 'shrink-0')}>
              {message.text}
            </div>
          ))}
          {typing && <Thinking label={`${name.split(' ')[0]} is typing`} />}
        </div>
        <div className="flex items-center gap-2 border-t border-border-button-default p-4">
          <div className="flex-1">
            <Input
              placeholder={`Message ${name.split(' ')[0]}`}
              value={draft}
              onChange={setDraft}
            />
          </div>
          <Button leadingIcon={RiSendPlaneFill} onClick={send}>
            Send
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ----- Phone chrome ------------------------------------------------------------------------- */

function StatusBar({ light }: { light?: boolean }) {
  return (
    <div
      className={cx(
        'flex h-12 shrink-0 items-center justify-between px-8 pt-2 text-body-2-semibold',
        light ? 'text-white' : 'text-text-primary',
      )}
    >
      <span>9:41</span>
      <span className="flex items-end gap-0.5">
        {[4, 6, 8, 10].map((h) => (
          <span key={h} className="w-[3px] rounded-sm bg-current" style={{ height: h }} />
        ))}
        <span className="ms-1.5 h-[11px] w-[22px] rounded-[3px] border border-current p-px">
          <span className="block h-full w-3/4 rounded-[1px] bg-current" />
        </span>
      </span>
    </div>
  );
}

function TabBar({ active }: { active: number }) {
  const items = [RiHome5Line, RiCompass3Line, RiBookmarkLine, RiUser3Line];
  return (
    <div className="flex shrink-0 justify-around border-t border-border-button-default px-6 pt-3 pb-7">
      {items.map((Icon, i) => (
        <Icon
          key={i}
          className={cx('size-6', i === active ? 'text-accent-500' : 'text-text-tertiary')}
        />
      ))}
    </div>
  );
}

function Phone({
  title,
  back,
  tab,
  children,
}: {
  title?: string;
  back?: boolean;
  tab?: number;
  children: ReactNode;
}) {
  return (
    <div className="flex h-full flex-col">
      <StatusBar />
      {title && (
        <div className="flex items-center gap-2 px-5 pt-2 pb-3">
          {back && <IconButton icon={RiArrowLeftSLine} aria-label="Back" onClick={flow(-1)} />}
          <h1 className="text-title-2-semibold text-text-primary">{title}</h1>
        </div>
      )}
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden px-5 pb-4">{children}</div>
      {tab !== undefined ? (
        <TabBar active={tab} />
      ) : (
        <div className="mx-auto mb-2 h-1.5 w-32 shrink-0 rounded-full bg-text-primary/80" />
      )}
    </div>
  );
}

function Row({ entry, product, seed }: { entry: Entry } & Props) {
  return (
    <div className="flex items-center gap-3">
      <Cover product={product} seed={seed} className="size-12 shrink-0 rounded-xl" />
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-body-medium text-text-primary">{entry.title}</span>
        <span className="truncate text-body-2-regular text-text-tertiary">{entry.sub}</span>
      </div>
      <span className="text-body-2-medium text-text-primary">{entry.value}</span>
    </div>
  );
}

/* ----- Phone screens ------------------------------------------------------------------------ */

function PhoneHome({ product, seed }: Props) {
  const [name] = PEOPLE[seed % PEOPLE.length];
  return (
    <Phone tab={0}>
      <div className="flex items-center justify-between pt-2">
        <div className="flex flex-col">
          <span className="text-body-2-regular text-text-tertiary">Hi {name.split(' ')[0]}</span>
          <span className="text-title-2-semibold text-text-primary">{product.name}</span>
        </div>
        <NotificationsButton items={notificationsOf(product, seed)} />
      </div>
      <div className="relative flex flex-col gap-1 overflow-hidden rounded-3xl bg-accent-500 p-5 text-white shadow-lg">
        <div className="absolute -end-10 -top-10 size-40 rounded-full bg-white/15" />
        <span className="text-body-2-medium text-white/80">{product.hero.label}</span>
        <span className="text-[30px] leading-tight font-semibold">{product.hero.value}</span>
        <span className="text-body-2-regular text-white/80">{product.hero.sub}</span>
      </div>
      <div className="grid grid-cols-4 gap-2">
        {product.nav.slice(1, 5).map((item) => (
          <div key={item} className="flex flex-col items-center gap-1.5">
            <span className="flex size-12 items-center justify-center rounded-2xl bg-accent-50 text-accent-600 dark:bg-accent-950">
              <product.icon className="size-5" />
            </span>
            <span className="truncate text-caption-1-medium text-text-secondary">{item}</span>
          </div>
        ))}
      </div>
      <span className="text-headline-semibold text-text-primary">Recent</span>
      {rotate(product.entries, seed)
        .slice(0, 4)
        .map((entry, i) => (
          <Row key={entry.title} entry={entry} product={product} seed={seed + i} />
        ))}
    </Phone>
  );
}

function PhoneList({ product, seed }: Props) {
  const [filter, setFilter] = useState(0);
  const statuses = [...new Set(product.entries.map((e) => e.status))].slice(0, 3);
  return (
    <Phone title={product.things} tab={1}>
      <Input placeholder={`Search ${product.things.toLowerCase()}`} leadingIcon={RiSearchLine} />
      <div className="flex gap-2">
        {['All', ...statuses].map((label, i) => (
          <button
            key={label}
            onClick={() => setFilter(i)}
            className={cx(
              'rounded-full px-3 py-1.5 text-body-2-medium',
              i === filter
                ? 'bg-accent-500 text-white'
                : 'bg-background-secondary-default text-text-secondary',
            )}
          >
            {label}
          </button>
        ))}
      </div>
      {rotate(product.entries, seed)
        .filter((entry) => filter === 0 || entry.status === statuses[filter - 1])
        .slice(0, 5)
        .map((entry, i) => (
          <div
            key={entry.title}
            className="flex flex-col gap-2 border-b border-border-button-default pb-3"
          >
            <Row entry={entry} product={product} seed={seed + i} />
            <div className="ps-15">
              <Status entry={entry} />
            </div>
          </div>
        ))}
    </Phone>
  );
}

function PhoneDetail({ product, seed }: Props) {
  const entry = product.entries[(seed + 1) % product.entries.length];
  return (
    <div className="relative flex h-full flex-col">
      <div className="relative h-[380px] shrink-0">
        <Cover product={product} seed={seed} className="absolute inset-0 size-full" />
        <div className="absolute inset-0 bg-gradient-to-b from-black/40 to-transparent" />
        <div className="relative">
          <StatusBar light />
        </div>
      </div>
      <div className="relative -mt-8 flex flex-1 flex-col gap-4 rounded-t-[32px] bg-background-primary-default px-6 pt-6">
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <span className="text-title-2-semibold text-text-primary">{entry.title}</span>
            <span className="flex items-center gap-1 text-body-2-regular text-text-tertiary">
              <RiMapPin2Line className="size-4" /> {entry.sub}
            </span>
          </div>
          <Status entry={entry} />
        </div>
        <p className="text-body-regular text-text-secondary">
          {product.tagline}. {product.features.slice(0, 2).join(', ')}.
        </p>
        <div className="flex -space-x-2">
          {PEOPLE.slice(seed % 4, (seed % 4) + 4).map(([name, src]) => (
            <span key={name} className="rounded-full ring-2 ring-background-primary-default">
              <Avatar size="sm" src={src} alt={name} />
            </span>
          ))}
        </div>
        <div className="mt-auto mb-8 flex items-center gap-3">
          <div className="flex flex-col">
            <span className="text-caption-1-regular text-text-tertiary">Total</span>
            <span className="text-title-3-semibold text-text-primary">{entry.value}</span>
          </div>
          <div className="flex-1">
            <Button className="w-full" onClick={flow(1)}>
              Continue
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function PhoneChat({ product, seed }: Props) {
  const [draft, setDraft] = useState('');
  const [sent, setSent] = useState<string[]>([]);
  const entry = product.entries[seed % product.entries.length];
  const send = () => {
    const text = draft.trim();
    if (!text) return;
    setSent((all) => [...all, text]);
    setDraft('');
  };
  return (
    <Phone title={`${product.name} assistant`} back>
      <div className="ms-auto max-w-[80%] rounded-2xl rounded-br-md bg-accent-500 px-4 py-2.5 text-body-regular text-white">
        What changed with {entry.title}?
      </div>
      <div className="max-w-[85%] rounded-2xl rounded-bl-md bg-background-secondary-default px-4 py-2.5 text-body-regular text-text-primary">
        It is {entry.status.toLowerCase()} now. {entry.sub}, {entry.value}. Want me to set a
        reminder?
      </div>
      <div className="ms-auto max-w-[80%] rounded-2xl rounded-br-md bg-accent-500 px-4 py-2.5 text-body-regular text-white">
        Yes, and show me similar {product.things.toLowerCase()}
      </div>
      <Thinking label={`Looking through your ${product.things.toLowerCase()}`} />
      {sent.map((text, i) => (
        <div
          key={i}
          className="ms-auto max-w-[80%] shrink-0 rounded-2xl rounded-br-md bg-accent-500 px-4 py-2.5 text-body-regular text-white"
        >
          {text}
        </div>
      ))}
      <div className="mt-auto flex items-center gap-2">
        <div className="flex-1">
          <Input placeholder="Ask anything" value={draft} onChange={setDraft} onEnter={send} />
        </div>
        <IconButton icon={RiArrowUpLine} aria-label="Send" onClick={send} />
      </div>
    </Phone>
  );
}

function PhoneProfile({ product, seed }: Props) {
  const [name, src] = PEOPLE[(seed + 3) % PEOPLE.length];
  const [on, setOn] = useState([true, false, true]);
  return (
    <Phone title="Profile" tab={3}>
      <div className="flex flex-col items-center gap-2 py-2">
        <img
          src={src}
          alt={name}
          className="size-20 rounded-full object-cover ring-4 ring-accent-100 dark:ring-accent-900"
        />
        <span className="text-title-3-semibold text-text-primary">{name}</span>
        <Badge color="primary">{product.name} member since 2023</Badge>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {product.kpis.slice(0, 3).map(([label, value]) => (
          <div
            key={label}
            className="flex flex-col items-center rounded-2xl bg-background-secondary-default p-3 text-center"
          >
            <span className="text-headline-semibold text-text-primary">{value}</span>
            <span className="text-caption-1-regular text-text-tertiary">{label}</span>
          </div>
        ))}
      </div>
      <div className="flex flex-col divide-y divide-border-button-default rounded-2xl border border-border-button-default">
        {['Notifications', 'Face ID', 'Share activity'].map((label, i) => (
          <label
            key={label}
            className="flex items-center justify-between px-4 py-3.5 text-body-medium text-text-primary"
          >
            {label}
            <Switch
              aria-label={label}
              isSelected={on[i]}
              onChange={(v) => setOn((p) => p.map((x, j) => (j === i ? v : x)))}
            />
          </label>
        ))}
      </div>
      <Button variant="secondary" onClick={(event) => toast(event.currentTarget, 'Signed out')}>
        Sign out
      </Button>
    </Phone>
  );
}

function PhoneOnboarding({ product, seed }: Props) {
  const [step, setStep] = useState(seed % 3);
  return (
    <div className="flex h-full flex-col bg-accent-500 text-white">
      <StatusBar light />
      <div className="relative mx-6 mt-4 h-[400px] overflow-hidden rounded-[32px]">
        <Cover product={product} seed={seed} className="absolute inset-0 size-full" />
        <div className="absolute bottom-4 left-4">
          <Logo product={product} size="lg" />
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-3 px-8 pt-8">
        <span className="text-[32px] leading-tight font-semibold">{product.features[step]}</span>
        <span className="text-body-regular text-white/80">
          {product.tagline}. It takes less than a minute to start.
        </span>
        <div className="mt-auto mb-10 flex items-center justify-between">
          <div className="flex gap-1.5">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className={cx(
                  'h-2 rounded-full bg-white transition-all',
                  i === step ? 'w-6' : 'w-2 opacity-40',
                )}
              />
            ))}
          </div>
          <button
            className="rounded-full bg-white px-6 py-3 text-body-semibold text-accent-700"
            onClick={() => setStep((s) => (s + 1) % 3)}
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}

function PhoneSignIn({ product, seed }: Props) {
  return (
    <Phone>
      <div className="flex flex-col items-start gap-6 pt-8">
        <Logo product={product} size="lg" />
        <SignInCard
          mode={seed % 2 ? 'signup' : 'signin'}
          layout="grid"
          providers={['google', 'apple', 'github']}
          description={seed % 2 ? `Start with ${product.name} in a couple of minutes.` : undefined}
        />
      </div>
    </Phone>
  );
}

function PhoneCheckout({ product, seed }: Props) {
  const items = rotate(product.entries, seed).slice(0, 3);
  const [agree, setAgree] = useState(true);
  return (
    <Phone title="Checkout" back>
      {items.map((entry, i) => (
        <Row key={entry.title} entry={entry} product={product} seed={seed + i} />
      ))}
      <Divider />
      <Select aria-label="Payment" defaultSelectedKey="apple">
        <SelectItem id="apple">Apple Pay</SelectItem>
        <SelectItem id="card">Visa ending 4242</SelectItem>
      </Select>
      <Input placeholder="Promo code" />
      <div className="flex flex-col gap-2 rounded-2xl bg-background-secondary-default p-4 text-body-2-regular text-text-secondary">
        <div className="flex justify-between">
          <span>Subtotal</span>
          <span>${(48 + (seed % 70)).toFixed(2)}</span>
        </div>
        <div className="flex justify-between">
          <span>Service</span>
          <span>$2.99</span>
        </div>
        <div className="flex justify-between text-headline-semibold text-text-primary">
          <span>Total</span>
          <span>${(50.99 + (seed % 70)).toFixed(2)}</span>
        </div>
      </div>
      <Checkbox isSelected={agree} onChange={setAgree}>
        Save for next time
      </Checkbox>
      <Button
        leadingIcon={RiAppleFill}
        done="Paid"
        onClick={(event) => toast(event.currentTarget, 'Payment complete')}
      >
        Pay now
      </Button>
    </Phone>
  );
}

function PhoneStats({ product, seed }: Props) {
  const [range, setRange] = useState(new Set(['week']));
  return (
    <Phone title="Activity" tab={2}>
      <SegmentedControl
        selectedKeys={range}
        onSelectionChange={(keys) => setRange(new Set(keys as Set<string>))}
        aria-label="Range"
      >
        <SegmentedControlItem id="week">Week</SegmentedControlItem>
        <SegmentedControlItem id="month">Month</SegmentedControlItem>
        <SegmentedControlItem id="year">Year</SegmentedControlItem>
      </SegmentedControl>
      <div className="flex items-center gap-4 rounded-3xl bg-background-secondary-default p-4">
        <Ring value={55 + (seed % 40)} size={120} label="of goal" />
        <div className="flex flex-col gap-1">
          <span className="text-body-2-regular text-text-tertiary">{product.hero.label}</span>
          <span className="text-title-2-semibold text-text-primary">{product.hero.value}</span>
          <span className="text-body-2-regular text-text-tertiary">{product.hero.sub}</span>
        </div>
      </div>
      <div className="flex flex-col gap-2 rounded-3xl border border-border-button-default p-4">
        <span className="text-headline-semibold text-text-primary">{product.kpis[1][0]}</span>
        <Bars seed={seed} count={7} height={120} />
        <div className="flex justify-between text-caption-1-regular text-text-tertiary">
          {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
            <span key={i}>{d}</span>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {product.kpis.slice(2, 4).map(([label, value, delta]) => (
          <Kpi key={label} label={label} value={value} delta={delta} />
        ))}
      </div>
    </Phone>
  );
}

const clock = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;

/** A player that plays: the time runs while it plays, and the skip buttons change the track. */
function PhonePlayer({ product, seed }: Props) {
  const [track, setTrack] = useState(seed % product.entries.length);
  const [elapsed, setElapsed] = useState(70 + (seed % 49));
  const [playing, setPlaying] = useState(false);
  const [liked, setLiked] = useState(false);
  const entry = product.entries[track];
  const length = 150 + ((track * 37 + seed) % 120);
  const skip = (by: number) => {
    setTrack((t) => (t + by + product.entries.length) % product.entries.length);
    setElapsed(0);
  };
  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => setElapsed((s) => s + 0.25), 250);
    return () => clearInterval(id);
  }, [playing]);
  if (elapsed >= length) skip(1);
  return (
    <div
      className="flex h-full flex-col"
      style={{
        background: 'linear-gradient(180deg, var(--color-accent-700), var(--color-accent-950))',
      }}
    >
      <StatusBar light />
      <div className="flex flex-1 flex-col gap-6 px-7 pt-6 text-white">
        <Cover
          product={product}
          seed={seed + track}
          className={cx(
            'aspect-square w-full rounded-3xl shadow-xl transition-transform duration-500',
            !playing && 'scale-[0.92]',
          )}
        />
        <div className="flex items-center justify-between">
          <div className="flex flex-col">
            <span className="text-title-2-semibold">{entry.title}</span>
            <span className="text-body-regular text-white/70">{entry.sub}</span>
          </div>
          <button aria-label="Like" onClick={() => setLiked((v) => !v)}>
            {liked ? <RiHeartFill className="size-7" /> : <RiHeartLine className="size-7" />}
          </button>
        </div>
        <div className="flex flex-col gap-2">
          <div className="h-1.5 rounded-full bg-white/25">
            <div
              className="h-full rounded-full bg-white"
              style={{ width: `${(elapsed / length) * 100}%` }}
            />
          </div>
          <div className="flex justify-between text-caption-1-regular text-white/70">
            <span>{clock(elapsed)}</span>
            <span>-{clock(length - elapsed)}</span>
          </div>
        </div>
        <div className="flex items-center justify-center gap-10">
          <button aria-label="Previous track" onClick={() => skip(-1)}>
            <RiSkipBackFill className="size-8" />
          </button>
          <button
            aria-label={playing ? 'Pause' : 'Play'}
            onClick={() => setPlaying((v) => !v)}
            className="flex size-18 items-center justify-center rounded-full bg-white text-accent-700"
          >
            {playing ? <RiPauseFill className="size-9" /> : <RiPlayFill className="size-9" />}
          </button>
          <button aria-label="Next track" onClick={() => skip(1)}>
            <RiSkipForwardFill className="size-8" />
          </button>
        </div>
      </div>
    </div>
  );
}

function PhoneNotifications({ product, seed }: Props) {
  const entries = rotate(product.entries, seed).slice(0, 5);
  const statuses = ['success', 'information', 'neutral', 'error', 'success'] as const;
  return (
    <Phone title="Notifications" tab={0}>
      {entries.map((entry, i) => (
        <Notification
          key={entry.title}
          status={statuses[(i + seed) % statuses.length]}
          title={`${entry.title}: ${entry.status.toLowerCase()}`}
          description={`${entry.sub}. ${entry.value}.`}
          timestamp={`${(i + 1) * (2 + (seed % 9))}m`}
        />
      ))}
    </Phone>
  );
}

function PhoneBooking({ product, seed }: Props) {
  const [date, setDate] = useState<Day>({ year: 2026, month: 8, day: 10 + (seed % 15) });
  const [slot, setSlot] = useState('10:30');
  return (
    <Phone title="Pick a time" back>
      <MonthCalendar value={date} onChange={setDate} />
      <div className="grid grid-cols-3 gap-2">
        {['09:00', '09:30', '10:30', '11:00', '14:00', '15:30'].map((time) => (
          <Button
            key={time}
            size="small"
            variant={time === slot ? 'primary' : 'secondary'}
            onClick={() => setSlot(time)}
          >
            {time}
          </Button>
        ))}
      </div>
      <Button
        done={`Booked for ${slot}`}
        onClick={(event) => toast(event.currentTarget, `Booked ${slot} with ${product.name}`)}
      >
        Book {slot} with {product.name}
      </Button>
    </Phone>
  );
}

/* ----- Catalog ------------------------------------------------------------------------------ */

function Frame({
  name,
  product,
  phone,
  children,
}: {
  name: string;
  product: Product;
  phone?: boolean;
  children: ReactNode;
}) {
  const [toastRoot, toasts] = useToasts();
  return (
    <div className="flex h-full flex-col" style={{ padding: `0 ${BLEED}px ${BLEED}px` }}>
      <span className="h-[30px] truncate text-body-2-medium text-text-tertiary">{name}</span>
      <div
        className={cx(
          'brand relative flex-1 overflow-hidden bg-background-primary-default shadow-xl ring-1 ring-black/5 dark:ring-white/10',
          phone ? 'rounded-[48px]' : 'rounded-2xl',
        )}
        style={{ '--brand': product.brand } as CSSProperties}
      >
        <div ref={toastRoot} className="relative h-full">
          {children}
          {toasts}
        </div>
      </div>
    </div>
  );
}

type Screen = (props: Props) => ReactNode;

export const DESKTOP_SCREENS: Record<string, Screen> = {
  Dashboard,
  List: ListPage,
  Board,
  Detail,
  Landing,
  Pricing,
  Calendar: CalendarPage,
  Settings: SettingsPage,
  'Sign in': SignIn,
  Reports: Analytics,
  Library: Gallery,
  Messages,
};

export const PHONE_SCREENS: Record<string, Screen> = {
  Home: PhoneHome,
  List: PhoneList,
  Detail: PhoneDetail,
  Assistant: PhoneChat,
  Profile: PhoneProfile,
  Welcome: PhoneOnboarding,
  'Sign in': PhoneSignIn,
  Checkout: PhoneCheckout,
  Activity: PhoneStats,
  Player: PhonePlayer,
  Notifications: PhoneNotifications,
  Booking: PhoneBooking,
};

/** Layouts that only make sense for some products: a player for audio, checkout for shops. */
const ONLY_FOR: Record<string, string[]> = {
  Player: ['Tempo', 'Airwaves'],
  Checkout: [
    'Forkful',
    'Atelier',
    'Pantry',
    'Encore',
    'Fern',
    'Wayfarer',
    'Roam',
    'Carely',
    'Stride',
  ],
  Booking: [
    'Wayfarer',
    'Carely',
    'Stride',
    'Roam',
    'Encore',
    'Nestwise',
    'Forkful',
    'Lumen',
    'Crew',
  ],
};

/** The layouts of `kind` that suit `product`. */
export function layoutsFor(kind: 'desktop' | 'phone', product: Product) {
  return Object.keys(kind === 'desktop' ? DESKTOP_SCREENS : PHONE_SCREENS).filter(
    (layout) => !ONLY_FOR[layout] || ONLY_FOR[layout].includes(product.name),
  );
}

export const DESKTOP_SIZE = {
  width: DESKTOP.width + BLEED * 2,
  height: DESKTOP.height + LABEL + BLEED,
};
export const PHONE_SIZE = { width: PHONE.width + BLEED * 2, height: PHONE.height + LABEL + BLEED };

/** A screen's frame name, the way a designer would name it: `Tempo / Web / Sign in`. */
export const screenName = (kind: 'desktop' | 'phone', layout: string, product: Product) =>
  `${product.name} / ${kind === 'desktop' ? 'Web' : 'iOS'} / ${layout === 'List' ? product.things : layout}`;

/** One framed screen of `product`. */
export function renderScreen(
  kind: 'desktop' | 'phone',
  layout: string,
  product: Product,
  seed: number,
) {
  const Screen = (kind === 'desktop' ? DESKTOP_SCREENS : PHONE_SCREENS)[layout];
  return (
    <Frame name={screenName(kind, layout, product)} product={product} phone={kind === 'phone'}>
      <Screen product={product} seed={seed} />
    </Frame>
  );
}
