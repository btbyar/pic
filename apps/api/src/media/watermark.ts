/**
 * Preview-д давхарлах watermark SVG. Хөндлөн давтагдсан бичиг — нэг булангаас тайрч арилгах боломжгүй.
 * Цагаан бичиг + бараан хүрээ нь цайвар, бараан аль ч зураг дээр харагдана.
 * Фонт: DejaVu Sans (Docker image-д суулгасан), байхгүй бол системийн sans-serif.
 */
export function watermarkSvg(width: number, height: number, text = 'PIC · PREVIEW'): Buffer {
  const fontSize = Math.max(14, Math.round(Math.min(width, height) / 14));
  const tileW = Math.round(fontSize * text.length * 0.75);
  const tileH = Math.round(fontSize * 4);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
  <defs>
    <pattern id="wm" width="${tileW}" height="${tileH}" patternUnits="userSpaceOnUse" patternTransform="rotate(-30)">
      <text x="0" y="${fontSize}" font-family="DejaVu Sans, Arial, sans-serif" font-size="${fontSize}" font-weight="700"
        fill="#ffffff" fill-opacity="0.38" stroke="#000000" stroke-opacity="0.18" stroke-width="${Math.max(1, fontSize / 24)}">${escapeXml(text)}</text>
    </pattern>
  </defs>
  <rect width="100%" height="100%" fill="url(#wm)"/>
</svg>`;
  return Buffer.from(svg);
}

function escapeXml(s: string): string {
  return s.replace(/[<>&"']/g, (c) => `&#${c.charCodeAt(0)};`);
}
