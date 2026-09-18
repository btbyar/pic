'use client';

import { useLayoutEffect, useRef, useState } from 'react';

/** Урт текстийг 3 мөрөөр таслаад "Цааш унших" товчоор нээнэ. Богино бол товч харагдахгүй. */
export function ExpandableText({ text, more, less, className = '' }: { text: string; more: string; less: string; className?: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const [open, setOpen] = useState(false);
  const [clamped, setClamped] = useState(false);

  useLayoutEffect(() => {
    const el = ref.current;
    if (el && !open) setClamped(el.scrollHeight > el.clientHeight + 1);
  }, [text, open]);

  return (
    <div className={`flex flex-col items-center gap-1 ${className}`}>
      <p ref={ref} className={`whitespace-pre-line text-pretty ${open ? '' : 'line-clamp-3'}`}>
        {text}
      </p>
      {clamped || open ? (
        <button type="button" onClick={() => setOpen((v) => !v)} className="text-sm font-semibold text-brand-700 hover:underline">
          {open ? less : more}
        </button>
      ) : null}
    </div>
  );
}
