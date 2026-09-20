// Эвэнтийн цагийг эвэнтийн цагийн бүсээр харуулна (хэрэглэгчийн браузерын бүсээр биш).
// MVP: маягт зөвхөн Asia/Ulaanbaatar (UTC+8, зуны цаггүй) дэмжинэ.

export const DEFAULT_TIMEZONE = 'Asia/Ulaanbaatar';
const UB_OFFSET = '+08:00';

function parts(iso: string, timeZone: string) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  const p = Object.fromEntries(fmt.formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
  return { y: p.year!, m: p.month!, d: p.day!, hh: p.hour!, mm: p.minute! };
}

/** ISO → `<input type="datetime-local">` утга */
export function isoToLocalInput(iso: string, timeZone = DEFAULT_TIMEZONE): string {
  const { y, m, d, hh, mm } = parts(iso, timeZone);
  return `${y}-${m}-${d}T${hh}:${mm}`;
}

/**
 * "2026-09-13T08:00" → "2026 оны 9 сарын 13, 08:00". Браузер datetime-local-ийг системийн хэлээр
 * (ихэвчлэн mm/dd/yyyy) харуулдаг тул сар, өдрийг андуурахаас сэргийлж давтан харуулна.
 */
export function describeLocalInput(value: string): string {
  const m = /^(d{4})-(d{2})-(d{2})T(d{2}):(d{2})/.exec(value);
  if (!m) return '';
  const [, y, mo, dd, hh, mi] = m;
  return `${y} оны ${Number(mo)} сарын ${Number(dd)}, ${hh}:${mi}`;
}

/** `<input type="datetime-local">` утга → offset-тэй ISO (API заавал offset шаарддаг) */
export function localInputToIso(value: string): string {
  return `${value.length === 16 ? `${value}:00` : value}${UB_OFFSET}`;
}

/** "2026.06.14 07:00 – 15:00" эсвэл өөр өдөр бол "2026.06.14 07:00 – 2026.06.15 15:00" */
export function formatEventRange(startsAt: string, endsAt: string, timeZone = DEFAULT_TIMEZONE): string {
  const s = parts(startsAt, timeZone);
  const e = parts(endsAt, timeZone);
  const start = `${s.y}.${s.m}.${s.d} ${s.hh}:${s.mm}`;
  const sameDay = s.y === e.y && s.m === e.m && s.d === e.d;
  return `${start} – ${sameDay ? '' : `${e.y}.${e.m}.${e.d} `}${e.hh}:${e.mm}`;
}

export function formatDate(iso: string, timeZone = DEFAULT_TIMEZONE): string {
  const { y, m, d } = parts(iso, timeZone);
  return `${y}.${m}.${d}`;
}

/** "09:32" — галерейд зураг авсан цаг */
export function formatTime(iso: string, timeZone = DEFAULT_TIMEZONE): string {
  const { hh, mm } = parts(iso, timeZone);
  return `${hh}:${mm}`;
}

/** "10 000 ₮" — мянгатын зай ба ₮-ийн өмнөх зай тасрахгүй (U+202F) */
export function formatMnt(amount: number): string {
  return `${new Intl.NumberFormat('en-US').format(amount).replace(/,/g, ' ')} ₮`;
}
