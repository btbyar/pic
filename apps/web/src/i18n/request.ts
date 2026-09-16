import { getRequestConfig } from 'next-intl/server';

// MVP: зөвхөн монгол. Англи нэмэхэд [locale] routing + proxy.ts нэмнэ.
export const defaultLocale = 'mn';

export default getRequestConfig(async () => {
  const locale = defaultLocale;
  return {
    locale,
    timeZone: 'Asia/Ulaanbaatar',
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
