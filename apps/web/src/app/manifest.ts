import type { MetadataRoute } from 'next';

// PWA manifest
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Pic — Эвэнтийн зураг',
    short_name: 'Pic',
    lang: 'mn',
    start_url: '/',
    display: 'standalone',
    background_color: '#0b0a0c',
    theme_color: '#0b0a0c',
    icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' }],
  };
}
