// Бүх мөнгөн дүн бүхэл төгрөг (₮). Бутархай хэзээ ч үүсэхгүй.

export const DEFAULT_PHOTOGRAPHER_SHARE_PCT = 70;

export interface RevenueSplit {
  photographerAmount: number;
  platformAmount: number;
}

/**
 * Нэг зургийн үнийг зурагчин / платформ хооронд хуваана.
 * Бутархай гарвал зурагчны хэсгийг доош бүхэлчилж, үлдэгдлийг платформд өгнө —
 * ингэснээр хоёрын нийлбэр үргэлж `price`-тэй яг тэнцүү.
 */
export function splitRevenue(price: number, photographerSharePct: number): RevenueSplit {
  if (!Number.isSafeInteger(price) || price < 0) {
    throw new RangeError(`price must be a non-negative integer, got ${price}`);
  }
  if (!Number.isInteger(photographerSharePct) || photographerSharePct < 0 || photographerSharePct > 100) {
    throw new RangeError(`photographerSharePct must be an integer 0..100, got ${photographerSharePct}`);
  }
  const photographerAmount = Math.floor((price * photographerSharePct) / 100);
  return { photographerAmount, platformAmount: price - photographerAmount };
}
