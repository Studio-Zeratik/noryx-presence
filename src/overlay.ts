/**
 * Live overlay for streaming software (OBS, Streamlabs…): a page with a transparent background that shows the
 * card and refreshes it every few seconds, without flickering (the next image is loaded before it replaces the
 * current one). Add it as a "Browser source"; the card fills the source's width.
 */
import { randomBytes } from 'node:crypto';
import { cardQuery, type CardOptions } from './card-render.js';

/** How often the overlay asks for a fresh card */
export const OVERLAY_REFRESH_MS = 5_000;

export function overlayPage(o: CardOptions): { html: string; nonce: string } {
  const nonce = randomBytes(16).toString('base64');
  const src = `card.svg?${cardQuery(o)}`;
  const html = `<!doctype html>
<html lang="${o.lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>NoryxBot Presence</title>
<style nonce="${nonce}">
html, body { margin: 0; padding: 0; background: transparent; overflow: hidden; }
img { display: block; width: 100%; height: auto; }
</style>
</head>
<body>
<img id="card" src="${src}" alt="">
<script nonce="${nonce}">
(function () {
  var card = document.getElementById('card');
  var base = ${JSON.stringify(src)};
  setInterval(function () {
    var next = new Image();
    next.onload = function () { card.src = next.src; };
    next.src = base + '&t=' + Date.now();
  }, ${OVERLAY_REFRESH_MS});
})();
</script>
</body>
</html>`;
  return { html, nonce };
}
