'use client';

import { PrinterIcon } from '@/components/icons';

export function PrintButton({ label }: { label: string }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl bg-brand-600 px-4 text-sm font-semibold text-white transition hover:bg-brand-700"
    >
      <PrinterIcon size={16} />
      {label}
    </button>
  );
}
