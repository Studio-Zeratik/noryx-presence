/**
 * PNG version of the cards, for places that refuse SVG images (forums, some site builders, chat apps).
 * The SVG card is drawn at twice its size so it stays sharp on high-density screens. The font (Poppins, OFL
 * licence) ships in assets/fonts, so the PNG looks the same everywhere. Emoji the font can't draw are left out.
 */
import { Resvg } from '@resvg/resvg-js';
import { fileURLToPath } from 'node:url';

const FONT_DIR = fileURLToPath(new URL('../assets/fonts/', import.meta.url));
const FONTS = ['Poppins-Bold.ttf', 'Poppins-SemiBold.ttf', 'Poppins-Regular.ttf'].map((f) => FONT_DIR + f);

/** Recent conversions, so a card shown on a busy page is only drawn once every few seconds */
const cache = new Map<string, { png: Buffer; at: number }>();
const CACHE_MS = 15_000;
const CACHE_MAX = 300;

/** The font has no emoji: they are left out of the PNG instead of showing as empty squares (images are base64, untouched) */
export function withoutEmoji(svg: string): string {
  return svg.replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}\u{20E3}\u{1F1E6}-\u{1F1FF}\u{1F3FB}-\u{1F3FF}]/gu, '').replace(/ +</g, '<');
}

export function svgToPng(svg: string, scale = 2): Buffer {
  const hit = cache.get(svg);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.png;
  const png = new Resvg(withoutEmoji(svg), {
    fitTo: { mode: 'zoom', value: scale },
    font: { fontFiles: FONTS, loadSystemFonts: false, defaultFontFamily: 'Poppins' },
  })
    .render()
    .asPng();
  cache.set(svg, { png, at: Date.now() });
  if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value!);
  return png;
}
