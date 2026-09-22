import type { ReactNode } from 'react';

/**
 * Кино тасалбар: «Премьер»-ийн гол хэлбэр. Үнэ, захиалга, төлбөр — мөнгөтэй холбоотой бүх зүйл тасалбар дээр.
 * `Perforation` нь хоёр хэсгийг цоолсон шугамаар тусгаарлана.
 */
export function Ticket({ children, className = '', glow = false }: { children: ReactNode; className?: string; glow?: boolean }) {
  return (
    <div
      className={`panel relative isolate overflow-hidden ${glow ? 'shadow-[0_30px_80px_-30px_rgba(232,180,90,0.45)]' : ''} ${className}`}
    >
      {glow ? <div aria-hidden className="pointer-events-none absolute -right-16 -top-16 -z-10 size-48 rounded-full bg-gold/20 blur-3xl" /> : null}
      {children}
    </div>
  );
}

export function Perforation() {
  return (
    <div aria-hidden className="relative my-1 h-6">
      <span className="absolute -left-3 top-0 size-6 rounded-full bg-night" />
      <span className="absolute -right-3 top-0 size-6 rounded-full bg-night" />
      <span className="absolute inset-x-5 top-1/2 border-t border-dashed border-line-strong/60" />
    </div>
  );
}
