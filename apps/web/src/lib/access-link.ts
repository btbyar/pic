'use client';

// Нууц холбоосыг API зөвхөн үүсгэх мөчид нэг удаа буцаана. Хуудас шилжих хооронд
// алдагдахгүйн тулд sessionStorage-д түр хадгалж, засварлах хуудас уншаад устгана.

const key = (eventId: string) => `pic:accessLink:${eventId}`;

export function rememberAccessLink(eventId: string, link: string): void {
  try {
    sessionStorage.setItem(key(eventId), link);
  } catch {
    // private mode г.м. — холбоосыг дахин үүсгэж болно
  }
}

export function takeAccessLink(eventId: string): string | null {
  try {
    const link = sessionStorage.getItem(key(eventId));
    sessionStorage.removeItem(key(eventId));
    return link;
  } catch {
    return null;
  }
}
