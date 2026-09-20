'use client';

import { PrinterIcon } from '@/components/icons';
import { Button } from '@/components/ui';

export function PrintButton({ label }: { label: string }) {
  return (
    <Button type="button" onClick={() => window.print()} className="gap-2 print:hidden">
      <PrinterIcon size={16} />
      {label}
    </Button>
  );
}
