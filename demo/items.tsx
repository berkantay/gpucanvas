import { useState, type ReactNode } from 'react';
import {
  RiArrowRightUpLine,
  RiCloseLine,
  RiLogoutBoxRLine,
  RiSettings3Line,
  RiSparkling2Line,
  RiUser3Line,
} from '@remixicon/react';
import { art, avatar } from './art';
import { Avatar, cx, Notification } from './ui';

/**
 * Everything besides product screens (screens.tsx) that can sit on the playground: a few loose
 * components, and what people scatter around screens on a real canvas (stickies, comments, arrows,
 * pictures). Sizes are the natural size of each item.
 */
export interface ItemKind {
  width: number;
  height: number;
  render: (variant: number) => ReactNode;
}

const pick = <T,>(list: readonly T[], variant: number) => list[variant % list.length];

/** Sticky colours stay the same in both themes, the way paper notes do. */
const STICKY = ['#fde68a', '#fbcfe8', '#bfdbfe', '#bbf7d0', '#ddd6fe', '#fed7aa'] as const;
const NOTES = [
  'Passkeys first, magic link as fallback?',
  'Too many steps before the first value. Cut two.',
  'Ask legal about the consent copy',
  'Empty state needs an illustration',
  'Dark mode contrast on the chips is low',
  'Can we reuse the table from billing?',
  'Users miss the export button',
  'Ship behind a flag on Monday',
  'Numbers look off for EMEA, check with data',
  'Make the CTA say what happens next',
  'Mobile: sidebar becomes a sheet',
  'Loading states for every card',
  'Copy review with Ann',
  'Is 8px radius enough here?',
  'Onboarding drop-off is at step 3',
  'Merge settings and preferences',
] as const;
const RETRO = [
  'Fewer meetings this sprint',
  'Design and eng paired on the table',
  'Release notes went out on time',
  'QA found issues late again',
  'Too much context switching',
  'Flaky preview deploys',
  'Try async standups',
  'Write the API contract first',
  'Demo every Friday',
  'Great feedback from the beta group',
  'Specs changed mid-sprint',
  'More user calls',
] as const;
const PEOPLE = [
  ['Ann Press', avatar('Ann Press')],
  ['Livia Saris', avatar('Livia Saris')],
  ['Jaydon Aminoff', avatar('Jaydon Aminoff')],
  ['Maria Lubin', avatar('Maria Lubin')],
  ['Kianna Vaccaro', avatar('Kianna Vaccaro')],
  ['John Clarkson', avatar('John Clarkson')],
  ['Aspen Lubin', avatar('Aspen Lubin')],
  ['Michael Ekstrom', avatar('Michael Ekstrom')],
] as const;
const COMMENTS = [
  'Love this direction. Can we try it with the brand blue?',
  'This spacing feels tight on mobile.',
  'Approved, ship it.',
  'What happens when the list is empty?',
  'Let us test this with five users first.',
  'Nice. The hierarchy reads much better now.',
] as const;
const IMAGES = Array.from({ length: 13 }, (_, i) => art(100 + i));

/** Raised surfaces on the canvas: white over the grey canvas, a hairline edge and a soft shadow. */
const SURFACE =
  'rounded-2xl bg-background-primary-default shadow-md ring-1 ring-black/5 dark:ring-white/10';

function Sticky({ variant, text, size }: { variant: number; text: string; size: number }) {
  // A slight tilt, inside the node's box: the corners stay transparent.
  const tilt = ((variant * 37) % 7) - 3;
  return (
    <div className="flex h-full items-center justify-center">
      <div
        className="flex flex-col justify-between p-4 text-[17px] leading-snug font-medium text-neutral-900 shadow-[0_8px_18px_-8px_rgba(0,0,0,0.35)]"
        style={{
          width: size,
          height: size,
          background: pick(STICKY, variant),
          rotate: `${tilt}deg`,
        }}
      >
        <span>{text}</span>
        <span className="text-[12px] text-neutral-900/55">{pick(PEOPLE, variant * 3)[0]}</span>
      </div>
    </div>
  );
}

function Comment({ variant }: { variant: number }) {
  const [name, src] = pick(PEOPLE, variant);
  const [resolved, setResolved] = useState(false);
  return (
    <div className="flex h-full items-start gap-2">
      <Avatar size="sm" src={src} alt={name} />
      <div className={cx('flex-1 rounded-tl-sm p-3', SURFACE)}>
        <div className="flex items-center gap-2">
          <span className="text-body-2-medium text-text-primary">{name.split(' ')[0]}</span>
          <span className="text-caption-1-regular text-text-tertiary">
            {(variant % 9) + 1}h ago
          </span>
          <button
            className="ms-auto text-caption-1-medium text-text-link"
            onClick={() => setResolved((value) => !value)}
          >
            {resolved ? 'Reopen' : 'Resolve'}
          </button>
        </div>
        <p
          className={cx('mt-1 text-body-2-regular text-text-secondary', resolved && 'line-through')}
        >
          {pick(COMMENTS, variant)}
        </p>
      </div>
    </div>
  );
}

function Picture({ variant }: { variant: number }) {
  return (
    <img
      src={pick(IMAGES, variant)}
      alt=""
      draggable={false}
      className="size-full rounded-xl object-cover shadow-md"
    />
  );
}

function Announcement() {
  const [open, setOpen] = useState(true);
  const [more, setMore] = useState(false);
  if (!open) return null;
  return (
    <div className={cx('flex h-full flex-col gap-2 p-4', SURFACE)}>
      <div className="flex items-center gap-2">
        <RiSparkling2Line className="size-5 text-accent-500" />
        <span className="text-body-2-semibold text-text-primary">Two new components</span>
        <button
          aria-label="Dismiss"
          onClick={() => setOpen(false)}
          className="ms-auto text-text-tertiary"
        >
          <RiCloseLine className="size-4" />
        </button>
      </div>
      <p className="text-body-2-regular text-text-secondary">
        Carousel and one time code inputs are ready to drop in today.
      </p>
      {more ? (
        <ul className="mt-auto list-disc ps-4 text-body-2-regular text-text-secondary">
          <li>Carousel: swipe, arrows and autoplay</li>
          <li>One time code: paste fills every box</li>
        </ul>
      ) : (
        <button
          className="mt-auto w-fit text-body-2-medium text-text-link"
          onClick={() => setMore(true)}
        >
          See what's new
        </button>
      )}
    </div>
  );
}

function Stat() {
  const [week, setWeek] = useState(false);
  return (
    <div className={cx('flex h-full flex-col p-5', SURFACE)}>
      <div className="flex items-center justify-between">
        <span className="text-body-2-medium text-text-tertiary">Monthly revenue</span>
        <button
          onClick={() => setWeek((value) => !value)}
          className="text-caption-1-medium text-text-link"
        >
          {week ? 'This week' : 'This month'}
        </button>
      </div>
      <span className="mt-2 text-display-4-semibold text-text-primary">
        {week ? '$11,204' : '$48,920'}
      </span>
      <span className="mt-1 flex items-center gap-1 text-caption-1-medium text-lime-600">
        <RiArrowRightUpLine className="size-4" /> {week ? '4.1%' : '12.6%'} vs last period
      </span>
      <div className="mt-auto flex h-10 items-end gap-1">
        {[38, 52, 44, 61, 57, 72, 66, 80, 74, 92].map((height, i) => (
          <span
            key={i}
            className="flex-1 rounded-sm bg-accent-500"
            style={{ height: `${week ? 100 - height * 0.6 : height}%`, opacity: 0.35 + i * 0.065 }}
          />
        ))}
      </div>
    </div>
  );
}

function Menu() {
  const [name, src] = pick(PEOPLE, 2);
  const [active, setActive] = useState('Profile');
  return (
    <div className={cx('flex h-full flex-col p-2.5', SURFACE)}>
      <div className="flex items-center gap-3 p-2">
        <Avatar size="md" src={src} alt={name} />
        <div className="flex flex-col">
          <span className="text-body-2-semibold text-text-primary">{name}</span>
          <span className="text-caption-1-regular text-text-tertiary">Pro plan</span>
        </div>
      </div>
      <hr className="my-1.5 border-border-button-default" />
      {(
        [
          [RiUser3Line, 'Profile'],
          [RiSettings3Line, 'Settings'],
          [RiSparkling2Line, 'Upgrade'],
          [RiLogoutBoxRLine, 'Sign out'],
        ] as const
      ).map(([Glyph, label]) => (
        <button
          key={label}
          onClick={() => setActive(label)}
          className={cx(
            'flex h-9 items-center gap-2.5 rounded-lg px-2 text-body-2-regular hover:bg-background-secondary-default',
            label === active
              ? 'bg-background-secondary-default text-text-primary'
              : 'text-text-secondary',
          )}
        >
          <Glyph className="size-[18px]" /> {label}
        </button>
      ))}
    </div>
  );
}

function Arrow({ variant }: { variant: number }) {
  const flip = variant % 2 === 1;
  return (
    <svg
      viewBox="0 0 160 90"
      className="size-full text-text-tertiary"
      style={flip ? { scale: '1 -1' } : undefined}
    >
      <path
        d="M6 70 C 50 10, 100 10, 146 44"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <path
        d="M128 36 L148 45 L134 62"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export const KINDS = {
  sticky: {
    width: 228,
    height: 228,
    render: (v) => <Sticky variant={v} text={pick(NOTES, v)} size={196} />,
  },
  retro: {
    width: 196,
    height: 196,
    render: (v) => <Sticky variant={v} text={pick(RETRO, v)} size={168} />,
  },
  comment: { width: 300, height: 90, render: (v) => <Comment variant={v} /> },
  arrow: { width: 160, height: 90, render: (v) => <Arrow variant={v} /> },
  photo: { width: 320, height: 240, render: (v) => <Picture variant={v} /> },
  portrait: { width: 240, height: 320, render: (v) => <Picture variant={v} /> },
  note: {
    width: 300,
    height: 56,
    render: (v) => (
      <p className="text-title-3-regular text-text-secondary">
        {pick(
          [
            'Option B tested best: 7 of 9 people finished without help.',
            'Spacing follows the 4px grid. Cards use radius 16.',
            'Keep the primary action on the right in every dialog.',
            'Final copy lives in the doc, not here.',
          ],
          v,
        )}
      </p>
    ),
  },
  swatches: {
    width: 320,
    height: 114,
    render: () => (
      <div className={cx('flex h-full items-center justify-center gap-2', SURFACE)}>
        {[
          ['bg-blue-300', 'bg-blue-400', 'bg-blue-500', 'bg-blue-600'],
          ['bg-violet-300', 'bg-violet-400', 'bg-violet-500', 'bg-violet-600'],
          ['bg-rose-300', 'bg-rose-400', 'bg-rose-500', 'bg-rose-600'],
          ['bg-amber-300', 'bg-amber-400', 'bg-amber-500', 'bg-amber-600'],
          ['bg-lime-300', 'bg-lime-400', 'bg-lime-500', 'bg-lime-600'],
          ['bg-cyan-300', 'bg-cyan-400', 'bg-cyan-500', 'bg-cyan-600'],
        ].map((scale, i) => (
          <div
            key={scale[0]}
            className={cx(
              'flex flex-col overflow-hidden rounded-full',
              i % 2 ? 'translate-y-2.5' : '-translate-y-2.5',
            )}
          >
            {scale.map((tone) => (
              <span key={tone} className={cx('h-5 w-7', tone)} />
            ))}
          </div>
        ))}
      </div>
    ),
  },
  type: {
    width: 300,
    height: 126,
    render: () => (
      <div className={cx('flex h-full flex-col justify-center gap-1 ps-6', SURFACE)}>
        <span className="text-display-4-semibold text-text-primary">Display</span>
        <span className="text-title-2-medium text-text-primary">Title</span>
        <span className="text-body-regular text-text-tertiary">Body regular</span>
      </div>
    ),
  },
  toast: {
    width: 320,
    height: 100,
    render: (v) => (
      <Notification
        status={pick(['success', 'error', 'information', 'neutral'] as const, v)}
        title={pick(
          ['Deployment finished', 'Payment failed', 'Storage almost full', 'New comment'],
          v,
        )}
        description={pick(
          [
            'The site is live on production.',
            'The card was declined. Try another one.',
            '92% of 50 GB used.',
            'Ann replied to your thread.',
          ],
          v,
        )}
        timestamp="2m ago"
      />
    ),
  },
  announcement: { width: 280, height: 152, render: () => <Announcement /> },
  stat: { width: 330, height: 198, render: () => <Stat /> },
  menu: { width: 266, height: 226, render: () => <Menu /> },
} satisfies Record<string, ItemKind>;

export type KindName = keyof typeof KINDS;
