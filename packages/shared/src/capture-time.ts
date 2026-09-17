// Зургийн авсан цаг: EXIF-ийн "ханын цаг" (цагийн бүсгүй) → UTC агшин.
//
// 1. EXIF-д OffsetTimeOriginal ("+08:00") байвал түүгээр.
// 2. Байхгүй бол эвэнтийн цагийн бүсээр (камер тухайн газрын цагаар тохируулагдсан гэж үзнэ).
// 3. Зурагчны камерын цагийн засварыг (clockOffsetSec) нэмнэ — олон зурагчны зураг нэг цагийн шугамд буух.

const EXIF_DATETIME = /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/;
const EXIF_OFFSET = /^([+-])(\d{2}):(\d{2})$/;

/** Боломжгүй огноог (камерын 0000:00:00, батарей дууссаны 1970 г.м.) хаяна */
const MIN_YEAR = 2000;
const MAX_YEAR = 2100;

/**
 * @returns UTC агшин, эсвэл уншигдахгүй/итгэмжгүй бол null
 */
export function parseExifDateTime(dateTime: string | undefined, offset: string | undefined, timeZone: string): Date | null {
  const m = dateTime ? EXIF_DATETIME.exec(dateTime.trim()) : null;
  if (!m) return null;
  const [year, month, day, hour, minute, second] = m.slice(1).map(Number) as [number, number, number, number, number, number];
  if (year < MIN_YEAR || year > MAX_YEAR || month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59 || second > 59) {
    return null;
  }
  const wall = Date.UTC(year, month - 1, day, hour, minute, second);
  // 2026-02-31 гэх мэт Date.UTC-ийн "шилжүүлэг"-ийг илрүүлнэ
  if (new Date(wall).getUTCDate() !== day) return null;

  const o = offset ? EXIF_OFFSET.exec(offset.trim()) : null;
  if (o) {
    const sign = o[1] === '-' ? -1 : 1;
    return new Date(wall - sign * (Number(o[2]) * 3600 + Number(o[3]) * 60) * 1000);
  }
  return zonedWallTimeToUtc(wall, timeZone);
}

export function applyClockOffset(raw: Date | null, clockOffsetSec: number): Date | null {
  return raw ? new Date(raw.getTime() + clockOffsetSec * 1000) : null;
}

/** `wall` нь тухайн бүсийн ханын цагийг UTC мэт кодлосон утга */
function zonedWallTimeToUtc(wall: number, timeZone: string): Date {
  // Эхний таамаг → бүсийн зөрүүг тэр агшинд тооцоод дахин засна (зуны цаг шилжих үед хоёр алхам хангалттай)
  let utc = wall - zoneOffsetMs(wall, timeZone);
  utc = wall - zoneOffsetMs(utc, timeZone);
  return new Date(utc);
}

const formatters = new Map<string, Intl.DateTimeFormat>();

function zoneOffsetMs(utcMs: number, timeZone: string): number {
  let fmt = formatters.get(timeZone);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    formatters.set(timeZone, fmt);
  }
  const p = Object.fromEntries(fmt.formatToParts(new Date(utcMs)).map((x) => [x.type, x.value]));
  const asUtc = Date.UTC(Number(p['year']), Number(p['month']) - 1, Number(p['day']), Number(p['hour']), Number(p['minute']), Number(p['second']));
  return asUtc - Math.floor(utcMs / 1000) * 1000;
}
