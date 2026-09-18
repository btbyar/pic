import type { Metadata, Viewport } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getTranslations } from 'next-intl/server';
import { Inter, Montserrat } from 'next/font/google';
import './globals.css';

// Монгол кирилл (ө, ү) нь cyrillic-ext-д багтана. Inter — үндсэн текст, Montserrat — гарчиг, лого.
const inter = Inter({ subsets: ['latin', 'cyrillic', 'cyrillic-ext'], variable: '--font-inter', display: 'swap' });
const montserrat = Montserrat({
  subsets: ['latin', 'cyrillic', 'cyrillic-ext'],
  weight: ['600', '700', '800'],
  variable: '--font-montserrat',
  display: 'swap',
});

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('meta');
  return { title: t('title'), description: t('description') };
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#c74716',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  return (
    <html lang={locale} className={`${inter.variable} ${montserrat.variable}`}>
      <body className="min-h-dvh bg-paper text-stone-900">
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
      </body>
    </html>
  );
}
