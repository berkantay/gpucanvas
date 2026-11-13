/**
 * The demo's own small component kit: plain React and Tailwind, nothing to install. It exists so
 * the canvas has real, interactive UI to render; it is not part of the gpucanvas package.
 */
import {
  createContext,
  useContext,
  useState,
  type ButtonHTMLAttributes,
  type ComponentType,
  type ReactNode,
} from 'react';
import {
  RiAppleFill,
  RiArrowLeftSLine,
  RiArrowRightSLine,
  RiCheckboxCircleFill,
  RiCloseLine,
  RiErrorWarningFill,
  RiGithubFill,
  RiGoogleFill,
  RiInformationFill,
  RiNotification3Fill,
} from '@remixicon/react';

export const cx = (...classes: (string | false | null | undefined)[]) =>
  classes.filter(Boolean).join(' ');

type Icon = ComponentType<{ className?: string }>;

/* ----- Buttons ------------------------------------------------------------------------------- */

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost';
  size?: 'small' | 'medium';
  leadingIcon?: Icon;
  trailingIcon?: Icon;
};

const BUTTON = {
  primary: 'bg-accent-500 text-white shadow-sm hover:bg-accent-600 disabled:opacity-50',
  secondary:
    'bg-background-primary-default text-text-primary ring-1 ring-border-button-default shadow-sm hover:bg-background-secondary-default',
  ghost:
    'bg-accent-100 text-accent-700 hover:bg-accent-200 dark:bg-accent-900 dark:text-accent-300',
};

export function Button({
  variant = 'primary',
  size = 'medium',
  leadingIcon: Leading,
  trailingIcon: Trailing,
  className,
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      className={cx(
        'inline-flex shrink-0 items-center justify-center gap-2 rounded-xl font-medium whitespace-nowrap transition-colors',
        size === 'small' ? 'h-9 px-3 text-body-2-medium' : 'h-10 px-4 text-body-2-semibold',
        BUTTON[variant],
        className,
      )}
    >
      {Leading && <Leading className="size-[18px]" />}
      {children}
      {Trailing && <Trailing className="size-[18px]" />}
    </button>
  );
}

export function IconButton({
  icon: Glyph,
  className,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { icon: Icon }) {
  return (
    <button
      {...rest}
      className={cx(
        'inline-flex size-10 shrink-0 items-center justify-center rounded-xl text-text-secondary ring-1 ring-border-button-default hover:bg-background-secondary-default',
        className,
      )}
    >
      <Glyph className="size-5" />
    </button>
  );
}

/* ----- Display ------------------------------------------------------------------------------- */

const AVATAR = { xs: 'size-6', sm: 'size-8', md: 'size-10', lg: 'size-14' };

export function Avatar({
  size = 'md',
  src,
  alt,
}: {
  size?: keyof typeof AVATAR;
  src: string;
  alt: string;
}) {
  return (
    <img
      src={src}
      alt={alt}
      draggable={false}
      className={cx('shrink-0 rounded-full object-cover', AVATAR[size])}
    />
  );
}

export function Badge({
  color,
  className,
  children,
}: {
  color?: 'primary' | 'neutral' | 'success' | 'error';
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cx(
        'inline-flex h-6 w-fit items-center rounded-full px-2.5 text-caption-1-medium',
        color === 'primary'
          ? 'bg-accent-100 text-accent-700 dark:bg-accent-900 dark:text-accent-200'
          : color === 'success'
            ? 'bg-lime-100 text-lime-800 dark:bg-lime-950 dark:text-lime-300'
            : color === 'error'
              ? 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300'
              : 'bg-background-secondary-default text-text-secondary',
        className,
      )}
    >
      {children}
    </span>
  );
}

const TONE = {
  orange: [
    'bg-orange-500 text-white',
    'bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300',
  ],
  lime: ['bg-lime-500 text-white', 'bg-lime-100 text-lime-800 dark:bg-lime-950 dark:text-lime-300'],
  rose: ['bg-rose-500 text-white', 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300'],
  yellow: [
    'bg-yellow-400 text-yellow-950',
    'bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-300',
  ],
  cyan: ['bg-cyan-500 text-white', 'bg-cyan-100 text-cyan-800 dark:bg-cyan-950 dark:text-cyan-300'],
  blue: ['bg-blue-500 text-white', 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300'],
  purple: [
    'bg-purple-500 text-white',
    'bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300',
  ],
  neutral: [
    'bg-neutral-700 text-white',
    'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300',
  ],
  gray: [
    'bg-neutral-500 text-white',
    'bg-neutral-100 text-neutral-800 dark:bg-neutral-800 dark:text-neutral-200',
  ],
  soft: [
    'bg-accent-500 text-white',
    'bg-accent-50 text-accent-700 dark:bg-accent-950 dark:text-accent-300',
  ],
} as const;
export type ChipColor = keyof typeof TONE;

export function Chip({
  color = 'neutral',
  variant = 'bold',
  className,
  children,
}: {
  color?: ChipColor;
  variant?: 'bold' | 'subtle';
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cx(
        'inline-flex h-6 w-fit items-center gap-1 rounded-md px-2 text-caption-1-medium whitespace-nowrap',
        TONE[color][variant === 'bold' ? 0 : 1],
        className,
      )}
    >
      {children}
    </span>
  );
}

export const Divider = () => <hr className="border-border-button-default" />;

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex h-6 min-w-6 items-center justify-center rounded-md bg-background-secondary-default px-1.5 font-sans text-caption-1-medium text-text-secondary ring-1 ring-border-button-default">
      {children}
    </kbd>
  );
}

export function Breadcrumb({ children }: { children: ReactNode }) {
  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-body-2-regular">
      {children}
    </nav>
  );
}

export function BreadcrumbItem({
  href,
  current,
  children,
}: {
  href?: string;
  current?: boolean;
  children: ReactNode;
}) {
  return current ? (
    <span aria-current="page" className="text-text-primary">
      {children}
    </span>
  ) : (
    <>
      <a href={href} className="text-text-tertiary hover:text-text-primary">
        {children}
      </a>
      <span className="text-text-tertiary">/</span>
    </>
  );
}

/* ----- Form fields --------------------------------------------------------------------------- */

const FIELD =
  'w-full rounded-xl bg-background-primary-default text-body-2-regular text-text-primary ring-1 ring-border-button-default outline-none placeholder:text-text-tertiary focus:ring-2 focus:ring-accent-500';

function Field({ label, children }: { label?: string; children: ReactNode }) {
  return label ? (
    <label className="flex flex-col gap-1.5">
      <span className="text-body-2-medium text-text-secondary">{label}</span>
      {children}
    </label>
  ) : (
    children
  );
}

export function Input({
  label,
  placeholder,
  value,
  defaultValue,
  onChange,
  leadingIcon: Leading,
  type = 'text',
}: {
  label?: string;
  placeholder?: string;
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  leadingIcon?: Icon;
  type?: string;
}) {
  return (
    <Field label={label}>
      <span className="relative flex">
        {Leading && (
          <Leading className="pointer-events-none absolute top-1/2 left-3 size-[18px] -translate-y-1/2 text-text-tertiary" />
        )}
        <input
          type={type}
          placeholder={placeholder}
          value={value}
          defaultValue={defaultValue}
          onChange={(event) => onChange?.(event.target.value)}
          className={cx(FIELD, 'h-10 pe-3', Leading ? 'ps-9' : 'ps-3')}
        />
      </span>
    </Field>
  );
}

export function Textarea({ label, defaultValue }: { label?: string; defaultValue?: string }) {
  return (
    <Field label={label}>
      <textarea defaultValue={defaultValue} rows={3} className={cx(FIELD, 'resize-none p-3')} />
    </Field>
  );
}

export function Checkbox({
  isSelected,
  onChange,
  children,
}: {
  isSelected: boolean;
  onChange: (value: boolean) => void;
  children: ReactNode;
}) {
  return (
    <label className="flex items-center gap-2.5 text-body-2-regular text-text-secondary">
      <input
        type="checkbox"
        checked={isSelected}
        onChange={(event) => onChange(event.target.checked)}
        className="size-[18px] accent-[var(--color-accent-500)]"
      />
      {children}
    </label>
  );
}

export function Switch({
  isSelected,
  onChange,
  'aria-label': ariaLabel,
}: {
  isSelected: boolean;
  onChange: (value: boolean) => void;
  'aria-label': string;
}) {
  return (
    <button
      role="switch"
      aria-checked={isSelected}
      aria-label={ariaLabel}
      onClick={() => onChange(!isSelected)}
      className={cx(
        'relative h-7 w-12 shrink-0 rounded-full transition-colors duration-200',
        isSelected ? 'bg-accent-500' : 'bg-neutral-300 dark:bg-neutral-600',
      )}
    >
      <span
        className={cx(
          'absolute top-0.5 left-0.5 size-6 rounded-full bg-white shadow transition-transform duration-200',
          isSelected && 'translate-x-5',
        )}
      />
    </button>
  );
}

export function Select({
  'aria-label': ariaLabel,
  selectedKey,
  defaultSelectedKey,
  onSelectionChange,
  triggerClassName,
  children,
}: {
  'aria-label': string;
  selectedKey?: string;
  defaultSelectedKey?: string;
  onSelectionChange?: (key: string) => void;
  triggerClassName?: string;
  children: ReactNode;
}) {
  return (
    <select
      aria-label={ariaLabel}
      value={selectedKey}
      defaultValue={defaultSelectedKey}
      onChange={(event) => onSelectionChange?.(event.target.value)}
      className={cx(FIELD, 'h-10 appearance-auto px-3', triggerClassName)}
    >
      {children}
    </select>
  );
}

export const SelectItem = ({
  id,
  isDisabled,
  children,
}: {
  id: string;
  textValue?: string;
  isDisabled?: boolean;
  children: ReactNode;
}) => (
  <option value={id} disabled={isDisabled}>
    {children}
  </option>
);

/* ----- Choosers: segmented control and tabs -------------------------------------------------- */

const Selection = createContext<{ selected: string; select: (id: string) => void }>({
  selected: '',
  select: () => {},
});

export function SegmentedControl({
  'aria-label': ariaLabel,
  selectedKeys,
  onSelectionChange,
  children,
}: {
  'aria-label': string;
  selectedKeys: Iterable<string>;
  onSelectionChange: (keys: Set<string>) => void;
  children: ReactNode;
}) {
  const selected = [...selectedKeys][0] ?? '';
  return (
    <Selection.Provider value={{ selected, select: (id) => onSelectionChange(new Set([id])) }}>
      <div
        role="radiogroup"
        aria-label={ariaLabel}
        className="inline-flex shrink-0 gap-0.5 rounded-xl bg-background-secondary-default p-1"
      >
        {children}
      </div>
    </Selection.Provider>
  );
}

export function SegmentedControlItem({
  id,
  isDisabled,
  children,
}: {
  id: string;
  isDisabled?: boolean;
  children: ReactNode;
}) {
  const { selected, select } = useContext(Selection);
  return (
    <button
      role="radio"
      aria-checked={selected === id}
      disabled={isDisabled}
      onClick={() => select(id)}
      className={cx(
        'h-8 rounded-lg px-3 text-body-2-medium whitespace-nowrap transition-colors duration-150 disabled:opacity-40',
        selected === id
          ? 'bg-background-primary-default text-text-primary shadow-card'
          : 'text-text-tertiary hover:text-text-primary',
      )}
    >
      {children}
    </button>
  );
}

export function Tabs({
  defaultSelectedKey,
  children,
}: {
  defaultSelectedKey: string;
  children: ReactNode;
}) {
  const [selected, select] = useState(defaultSelectedKey);
  return <Selection.Provider value={{ selected, select }}>{children}</Selection.Provider>;
}

export function TabList({
  'aria-label': ariaLabel,
  children,
}: {
  'aria-label': string;
  children: ReactNode;
}) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className="flex gap-6 border-b border-border-button-default"
    >
      {children}
    </div>
  );
}

export function Tab({ id, count, children }: { id: string; count?: number; children: ReactNode }) {
  const { selected, select } = useContext(Selection);
  const active = selected === id;
  return (
    <button
      role="tab"
      aria-selected={active}
      onClick={() => select(id)}
      className={cx(
        '-mb-px flex h-10 items-center gap-2 border-b-2 text-body-2-medium',
        active ? 'border-accent-500 text-text-primary' : 'border-transparent text-text-tertiary',
      )}
    >
      {children}
      {count !== undefined && (
        <span
          className={cx(
            'rounded-full px-1.5 text-caption-1-medium',
            active
              ? 'bg-accent-100 text-accent-700 dark:bg-accent-900 dark:text-accent-200'
              : 'bg-background-secondary-default',
          )}
        >
          {count}
        </span>
      )}
    </button>
  );
}

/* ----- Table --------------------------------------------------------------------------------- */

export const Table = ({ children }: { 'aria-label'?: string; children: ReactNode }) => (
  <table className="w-full text-start text-body-2-regular">{children}</table>
);
export const TableHeader = ({ children }: { children: ReactNode }) => (
  <thead>
    <tr className="border-b border-border-button-default">{children}</tr>
  </thead>
);
export const TableColumn = ({
  children,
}: {
  id?: string;
  isRowHeader?: boolean;
  children: ReactNode;
}) => <th className="h-10 px-3 text-start text-caption-1-medium text-text-tertiary">{children}</th>;
export const TableBody = ({ children }: { children: ReactNode }) => <tbody>{children}</tbody>;
export const TableRow = ({ children }: { id?: string; children: ReactNode }) => (
  <tr className="border-b border-border-button-default last:border-0">{children}</tr>
);
export const TableCell = ({ children }: { children: ReactNode }) => (
  <td className="h-14 px-3 text-text-primary">{children}</td>
);

/* ----- Feedback ------------------------------------------------------------------------------ */

const STATUS = {
  success: [RiCheckboxCircleFill, 'text-lime-500'],
  error: [RiErrorWarningFill, 'text-rose-500'],
  information: [RiInformationFill, 'text-blue-500'],
  neutral: [RiNotification3Fill, 'text-text-tertiary'],
} as const;

/** A notification card; its close button removes it. */
export function Notification({
  status,
  title,
  description,
  timestamp,
}: {
  status: keyof typeof STATUS;
  title: string;
  description: string;
  timestamp: string;
}) {
  const [open, setOpen] = useState(true);
  if (!open) return null;
  const [Glyph, tone] = STATUS[status];
  return (
    <div className="flex w-full gap-3 rounded-2xl bg-background-primary-default p-3.5 shadow-card ring-1 ring-black/5 dark:ring-white/10">
      <Glyph className={cx('mt-0.5 size-5 shrink-0', tone)} />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex items-baseline gap-2">
          <span className="truncate text-body-2-semibold text-text-primary">{title}</span>
          <span className="ms-auto shrink-0 text-caption-1-regular text-text-tertiary">
            {timestamp}
          </span>
        </div>
        <span className="line-clamp-2 text-body-2-regular text-text-secondary">{description}</span>
      </div>
      <button
        aria-label="Dismiss notification"
        onClick={() => setOpen(false)}
        className="-me-1 -mt-1 flex size-7 shrink-0 items-center justify-center rounded-lg text-text-tertiary hover:bg-background-secondary-default"
      >
        <RiCloseLine className="size-4" />
      </button>
    </div>
  );
}

/** Someone is typing: three pulsing dots and a label. */
export function Thinking({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 text-body-2-regular text-text-tertiary">
      <span className="flex gap-1">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="size-1.5 rounded-full bg-text-tertiary"
            style={{ animation: `thinking 1.2s ${i * 0.15}s infinite ease-in-out` }}
          />
        ))}
      </span>
      {label}
    </div>
  );
}

/* ----- Calendar ------------------------------------------------------------------------------ */

export interface Day {
  year: number;
  /** 1 to 12. */
  month: number;
  day: number;
}

const MONTHS = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' });

/** One month to pick a day from, with arrows to the months around it. */
export function MonthCalendar({ value, onChange }: { value: Day; onChange: (day: Day) => void }) {
  const [shown, setShown] = useState({ year: value.year, month: value.month });
  const first = new Date(shown.year, shown.month - 1, 1);
  const days = new Date(shown.year, shown.month, 0).getDate();
  // Weeks start on Monday.
  const blank = (first.getDay() + 6) % 7;
  const move = (by: number) => {
    const next = new Date(shown.year, shown.month - 1 + by, 1);
    setShown({ year: next.getFullYear(), month: next.getMonth() + 1 });
  };
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-body-semibold text-text-primary">{MONTHS.format(first)}</span>
        <span className="flex gap-1">
          <IconButton icon={RiArrowLeftSLine} aria-label="Previous" onClick={() => move(-1)} />
          <IconButton icon={RiArrowRightSLine} aria-label="Next" onClick={() => move(1)} />
        </span>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center">
        {['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map((name) => (
          <span key={name} className="text-caption-1-medium text-text-tertiary">
            {name}
          </span>
        ))}
        {Array.from({ length: blank }, (_, i) => (
          <span key={`blank-${i}`} />
        ))}
        {Array.from({ length: days }, (_, i) => {
          const day = i + 1;
          const picked =
            value.year === shown.year && value.month === shown.month && value.day === day;
          return (
            <button
              key={day}
              onClick={() => onChange({ ...shown, day })}
              className={cx(
                'flex aspect-square items-center justify-center rounded-full text-body-2-medium',
                picked
                  ? 'bg-accent-500 text-white'
                  : 'text-text-primary hover:bg-background-secondary-default',
              )}
            >
              {day}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ----- Sign in ------------------------------------------------------------------------------- */

const PROVIDERS = {
  google: [RiGoogleFill, 'Google'],
  apple: [RiAppleFill, 'Apple'],
  github: [RiGithubFill, 'GitHub'],
} as const;

/** A sign in or sign up card: social providers, email and password. */
export function SignInCard({
  mode,
  layout = 'stacked',
  providers,
  description,
}: {
  mode: 'signin' | 'signup';
  layout?: 'stacked' | 'grid';
  providers: (keyof typeof PROVIDERS)[];
  description?: string;
}) {
  const [remember, setRemember] = useState(true);
  return (
    <div className="flex w-full flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h1 className="text-title-1-semibold text-text-primary">
          {mode === 'signin' ? 'Welcome back' : 'Create your account'}
        </h1>
        <p className="text-body-2-regular text-text-tertiary">
          {description ?? 'Sign in to continue where you left off.'}
        </p>
      </div>
      <div className={cx('gap-2', layout === 'grid' ? 'grid grid-cols-3' : 'flex flex-col')}>
        {providers.map((id) => {
          const [Glyph, name] = PROVIDERS[id];
          return (
            <Button key={id} variant="secondary" leadingIcon={Glyph}>
              {layout === 'grid' ? name : `Continue with ${name}`}
            </Button>
          );
        })}
      </div>
      <div className="flex items-center gap-3 text-caption-1-regular text-text-tertiary">
        <span className="h-px flex-1 bg-border-button-default" />
        or
        <span className="h-px flex-1 bg-border-button-default" />
      </div>
      <Input label="Email" placeholder="you@company.com" type="email" />
      <Input label="Password" placeholder="At least 8 characters" type="password" />
      {mode === 'signin' && (
        <Checkbox isSelected={remember} onChange={setRemember}>
          Keep me signed in
        </Checkbox>
      )}
      <Button>{mode === 'signin' ? 'Sign in' : 'Create account'}</Button>
    </div>
  );
}
