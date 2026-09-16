import type { EventVisibility } from '@pic/shared';
import { useTranslations } from 'next-intl';
import { Badge } from './ui';

const tone = { PUBLIC: 'green', UNLISTED: 'amber', HIDDEN: 'slate' } as const;

export function VisibilityBadge({ visibility }: { visibility: EventVisibility }) {
  const t = useTranslations('eventForm');
  return <Badge tone={tone[visibility]}>{t(`badge_${visibility}`)}</Badge>;
}
