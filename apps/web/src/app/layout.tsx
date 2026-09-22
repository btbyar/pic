import type { Metadata, Viewport } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getTranslations } from 'next-intl/server';
import { Cormorant, IBM_Plex_Mono, Manrope } from 'next/font/google';
import './globals.css';

// Монгол кирилл (ө, ү) нь cyrillic-ext-д багтана.
// Cormorant — кино титрийн serif (гарчиг, үнэ), Manrope — үндсэн текст, IBM Plex Mono — timecode, шошго.
const cormorant = Cormorant({
  subsets: ['latin', 'cyrillic', 'cyrillic-ext'],
  weight: ['500', '600', '700'],
  style: ['normal', 'italic'],
  variable: '--font-cormorant',
  display: 'swap',
});
const manrope = Manrope({ subsets: ['latin', 'cyrillic', 'cyrillic-ext'], variable: '--font-manrope', display: 'swap' });
const plexMono = IBM_Plex_Mono({
  subsets: ['latin', 'cyrillic', 'cyrillic-ext'],
  weight: ['400', '500', '600'],
  variable: '--font-plex-mono',
  display: 'swap',
});

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('meta');
  return { title: t('title'), description: t('description') };
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#0b0a0c',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  return (
    <html lang={locale} className={`${manrope.variable} ${cormorant.variable} ${plexMono.variable}`}>
      <body className="min-h-dvh bg-night font-sans text-ivory">
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
      </body>
    </html>
  );
}
