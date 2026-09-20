import type { ReactNode } from 'react';

/**
 * Камерын фокусын булангийн хаалт. Чимэглэл биш — "энэ хүрээн доторх зураг чинийх" гэдгийг заана:
 * hero зураг, олдсон зураг, селфи авах хүрээнд л хэрэглэнэ.
 */
export function FocusFrame({
  children,
  className = '',
  tone = 'brand',
  lock = false,
}: {
  children: ReactNode;
  className?: string;
  tone?: 'brand' | 'ink';
  /** Үр дүн ирэх мөчид хаалт нэг удаа таталт хийнэ (камер фокус тогтоох) */
  lock?: boolean;
}) {
  const color = tone === 'brand' ? 'border-brand-600' : 'border-ink/70';
  const corner = `pointer-events-none absolute h-6 w-6 ${color}`;
  return (
    <div className={`relative ${lock ? 'focus-lock' : ''} ${className}`}>
      {children}
      <span aria-hidden className={`${corner} left-0 top-0 border-l-2 border-t-2`} />
      <span aria-hidden className={`${corner} right-0 top-0 border-r-2 border-t-2`} />
      <span aria-hidden className={`${corner} bottom-0 left-0 border-b-2 border-l-2`} />
      <span aria-hidden className={`${corner} bottom-0 right-0 border-b-2 border-r-2`} />
    </div>
  );
}
