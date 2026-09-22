import Link from 'next/link';
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from 'react';
import { AlertIcon, CheckIcon } from './icons';

/*
 * «Премьер» компонент систем. Нэг л гэрэлтэй товч (алт) — хуудас бүрт гол үйлдэл нэг.
 * Бусад нь танхимын хананд уусна: шилэн (ghost), хүрээтэй (secondary), улаан (danger).
 */
const buttonStyles = {
  primary:
    'shine bg-gold text-gold-ink shadow-[0_10px_40px_-12px_rgba(232,180,90,0.65)] hover:bg-gold-soft disabled:bg-night-3 disabled:text-dim disabled:shadow-none',
  dark: 'bg-ivory text-night hover:bg-white disabled:bg-night-3 disabled:text-dim',
  secondary: 'bg-white/[0.04] text-ivory ring-1 ring-inset ring-line-strong hover:bg-white/[0.08] hover:ring-mist disabled:text-dim disabled:ring-line',
  ghost: 'text-ivory hover:bg-white/[0.06] disabled:text-dim',
  danger: 'bg-ember text-night hover:bg-[#ff9580] disabled:bg-night-3 disabled:text-dim',
} as const;

type Variant = keyof typeof buttonStyles;
type Size = 'md' | 'lg';

const base =
  'inline-flex cursor-pointer select-none items-center justify-center gap-2 rounded-[10px] font-semibold tracking-[-0.01em] transition duration-300 ease-cine active:scale-[0.97] disabled:cursor-not-allowed disabled:active:scale-100';
const sizes: Record<Size, string> = {
  md: 'min-h-12 px-5 text-[15px]',
  lg: 'min-h-14 px-7 text-base',
};

export function buttonClass(variant: Variant = 'primary', size: Size = 'md', className = '') {
  return `${base} ${sizes[size]} ${buttonStyles[variant]} ${className}`;
}

export function Button({
  variant = 'primary',
  size = 'md',
  busy = false,
  className = '',
  children,
  disabled,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size; busy?: boolean }) {
  return (
    <button className={buttonClass(variant, size, className)} disabled={disabled || busy} aria-busy={busy || undefined} {...props}>
      {busy ? <Spinner /> : null}
      {children}
    </button>
  );
}

export function ButtonLink({
  href,
  variant = 'primary',
  size = 'md',
  className = '',
  children,
}: {
  href: string;
  variant?: Variant;
  size?: Size;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link href={href} className={buttonClass(variant, size, className)}>
      {children}
    </Link>
  );
}

export function Spinner({ className = 'size-4' }: { className?: string }) {
  return <span aria-hidden className={`inline-block shrink-0 animate-spin rounded-full border-2 border-current border-r-transparent ${className}`} />;
}

const fieldBase =
  'w-full rounded-[10px] bg-night-2 px-4 text-base text-ivory outline-none ring-1 ring-inset transition duration-200 placeholder:text-dim focus:bg-night-3 focus:ring-2 focus:ring-gold';

export function Input({ invalid, className = '', ...props }: InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }) {
  return (
    <input
      aria-invalid={invalid || undefined}
      className={`${fieldBase} min-h-13 ${invalid ? 'ring-ember' : 'ring-line-strong hover:ring-mist'} ${className}`}
      {...props}
    />
  );
}

export function Textarea({ invalid, className = '', ...props }: TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }) {
  return (
    <textarea
      aria-invalid={invalid || undefined}
      className={`${fieldBase} py-3 ${invalid ? 'ring-ember' : 'ring-line-strong hover:ring-mist'} ${className}`}
      {...props}
    />
  );
}

export function Field({
  label,
  hint,
  error,
  htmlFor,
  children,
}: {
  label: string;
  hint?: string | undefined;
  error?: string | undefined;
  htmlFor: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={htmlFor} className="text-sm font-semibold text-ivory">
        {label}
      </label>
      {children}
      {error ? (
        <p id={`${htmlFor}-error`} role="alert" className="flex items-center gap-1.5 text-sm text-ember">
          <AlertIcon size={14} className="shrink-0" />
          {error}
        </p>
      ) : hint ? (
        <p id={`${htmlFor}-hint`} className="text-sm text-mist">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/** Танхимын хананд тусах гэрэлтэй хавтан */
export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`panel p-5 sm:p-6 ${className}`}>{children}</div>;
}

export function Alert({ kind = 'error', children }: { kind?: 'error' | 'info' | 'success'; children: ReactNode }) {
  const styles = {
    error: 'bg-ember/10 text-[#ffc2b4] ring-ember/35',
    info: 'bg-gold/[0.07] text-gold-soft ring-gold/30',
    success: 'bg-jade/10 text-[#a8ecce] ring-jade/35',
  }[kind];
  return (
    <div
      role={kind === 'error' ? 'alert' : 'status'}
      className={`flex animate-fade items-start gap-3 rounded-[14px] px-4 py-3.5 text-sm leading-relaxed ring-1 ring-inset ${styles}`}
    >
      {kind === 'success' ? <CheckIcon size={18} className="mt-px shrink-0" /> : <AlertIcon size={18} className="mt-px shrink-0" />}
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

export function Badge({ children, tone = 'slate' }: { children: ReactNode; tone?: 'slate' | 'green' | 'amber' | 'red' }) {
  const styles = {
    slate: 'text-mist ring-line-strong/60',
    green: 'text-jade ring-jade/40',
    amber: 'text-gold ring-gold/40',
    red: 'text-ember ring-ember/40',
  }[tone];
  const dot = { slate: 'bg-mist', green: 'bg-jade', amber: 'bg-gold animate-blink', red: 'bg-ember' }[tone];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.14em] ring-1 ring-inset ${styles}`}>
      <span aria-hidden className={`size-1.5 rounded-full ${dot}`} />
      {children}
    </span>
  );
}

/** Timecode маягийн шошго — хэсгийн нэр, алхмын дугаар */
export function Kicker({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <span className={`kicker inline-flex items-center gap-2.5 ${className}`}>
      <span aria-hidden className="h-px w-6 bg-gold" />
      {children}
    </span>
  );
}

/** Хоосон төлөв: мухардал биш — үргэлж дараагийн алхамтай */
export function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon?: ReactNode;
  title: string;
  body?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="relative flex animate-rise flex-col items-center gap-4 overflow-hidden rounded-3xl px-6 py-16 text-center ring-1 ring-inset ring-line">
      <div aria-hidden className="pointer-events-none absolute -top-24 left-1/2 size-72 -translate-x-1/2 rounded-full bg-gold/10 blur-3xl" />
      {icon ? <span className="relative flex size-16 items-center justify-center rounded-full bg-night-3 text-gold ring-1 ring-line">{icon}</span> : null}
      <p className="relative font-display text-3xl font-semibold leading-tight">{title}</p>
      {body ? <div className="relative max-w-md text-mist">{body}</div> : null}
      {action ? <div className="relative mt-2 flex flex-wrap justify-center gap-3">{action}</div> : null}
    </div>
  );
}

/** Сүүлийн хэсгийн гарчиг: kicker + serif гарчиг + баруун талд үйлдэл */
export function SectionHead({ kicker, title, action }: { kicker?: string; title: string; action?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="flex flex-col gap-3">
        {kicker ? <Kicker>{kicker}</Kicker> : null}
        <h2 className="font-display text-4xl font-semibold leading-none tracking-[-0.02em] sm:text-5xl">{title}</h2>
      </div>
      {action}
    </div>
  );
}

/** Пультын хуудасны толгой: kicker + serif гарчиг + тайлбар, баруун талд гол үйлдэл */
export function PageHeader({ kicker, title, intro, action }: { kicker?: string; title: string; intro?: ReactNode; action?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-6">
      <div className="flex min-w-0 max-w-2xl flex-col gap-4">
        {kicker ? <Kicker className="animate-rise">{kicker}</Kicker> : null}
        <h1 className="animate-rise break-words font-display text-[clamp(2.5rem,6vw,4.25rem)] font-semibold leading-[0.92] tracking-[-0.03em] stagger [--i:1]">
          {title}
        </h1>
        {intro ? <div className="animate-rise text-[15px] leading-relaxed text-mist stagger [--i:2]">{intro}</div> : null}
      </div>
      {action ? <div className="flex animate-rise flex-wrap gap-2 stagger [--i:2]">{action}</div> : null}
    </header>
  );
}

/** Тоон үзүүлэлт: mono шошго + том serif тоо. `accent` — хамгийн чухал нэг тоо алтаар */
export function Stat({
  label,
  children,
  note,
  accent = false,
  className = '',
}: {
  label: string;
  children: ReactNode;
  note?: ReactNode;
  accent?: boolean;
  className?: string;
}) {
  return (
    <div className={`panel relative flex flex-col gap-3 overflow-hidden p-4 sm:p-6 ${className} ${accent ? 'ring-1 ring-inset ring-gold/30' : ''}`}>
      {accent ? <div aria-hidden className="pointer-events-none absolute -right-10 -top-10 size-32 rounded-full bg-gold/15 blur-2xl" /> : null}
      <dt className="kicker">{label}</dt>
      <dd className={`font-display text-[2rem] font-semibold sm:text-[2.5rem] leading-none tracking-[-0.02em] ${accent ? 'text-gold' : ''}`}>{children}</dd>
      {note ? <dd className="text-sm text-mist">{note}</dd> : null}
    </div>
  );
}

/** Шүүлтүүрийн табууд (URL-ээр): идэвхтэй нь ivory, тоо нь mono */
export function FilterTabs({ label, items }: { label: string; items: { href: string; label: string; active: boolean; count?: number }[] }) {
  return (
    <nav aria-label={label} className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:px-0">
      <ul className="flex gap-1.5">
        {items.map((item) => (
          <li key={item.href}>
            <Link
              href={item.href}
              aria-current={item.active ? 'page' : undefined}
              className={`flex min-h-11 items-center gap-2 whitespace-nowrap rounded-full px-4 text-sm font-semibold ring-1 ring-inset transition ${
                item.active ? 'bg-ivory text-night ring-ivory' : 'text-mist ring-line-strong/60 hover:text-ivory hover:ring-mist'
              }`}
            >
              {item.label}
              {item.count ? <span className={`font-mono text-[11px] tabular-nums ${item.active ? 'text-night/60' : 'text-gold'}`}>{item.count}</span> : null}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
