import type { MetadataRoute } from 'next';

// PWA manifest. Icon-ууд Phase 4-т (UI) нэмэгдэнэ.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Pic — Эвэнтийн зураг',
    short_name: 'Pic',
    lang: 'mn',
    start_url: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#0f172a',
  };
}
