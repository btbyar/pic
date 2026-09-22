'use client';

import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/lib/api-client';

export function LogoutButton() {
  const t = useTranslations('common');
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  return (
    <button
      type="button"
      disabled={busy}
      className="min-h-8 cursor-pointer self-start text-left text-xs font-semibold text-mist transition hover:text-gold"
      onClick={async () => {
        setBusy(true);
        await api('/auth/logout', { method: 'POST' });
        router.replace('/login');
        router.refresh();
      }}
    >
      {t('logout')}
    </button>
  );
}
