# NoryxBot Presence

[![CI](https://github.com/Studio-Zeratik/noryx-presence/actions/workflows/ci.yml/badge.svg)](https://github.com/Studio-Zeratik/noryx-presence/actions/workflows/ci.yml)
[![Licence: AGPL-3.0](https://img.shields.io/badge/licence-AGPL--3.0-c6f432)](LICENSE)
[![Service status](https://studiozeratik.com/api/status/badge.svg)](https://studiozeratik.com/status/)

**Your live Discord status on your website, in one line.** Online status, games, Spotify and custom
status, updated in real time. Free, no sign-up, no API key: your Discord account is enough.

By [Studio Zératik](https://studiozeratik.com), part of the [NoryxBot](https://noryxbot.com) family.
Hosted in France (EU). Documentation: **[noryxbot.com/presence](https://noryxbot.com/presence/)** ·
Status: **[studiozeratik.com/status](https://studiozeratik.com/status/)**

```html
<img src="https://presence.noryxbot.com/v1/users/YOUR_DISCORD_ID/card.svg" alt="My Discord status" width="460" height="128">
```

---

## Why NoryxBot Presence

| | Usual presence APIs | NoryxBot Presence |
| --- | --- | --- |
| **Switching** | — | Same response format and live socket: change one address |
| **Ready-to-embed card** | Needs a separate tool | Built in: themes, accent colour, compact size, Spotify card, SVG or PNG, English or French |
| **Streaming** | — | A live overlay for OBS and other streaming software |
| **Images** | You build the addresses yourself | Ready-to-use avatar, game and album art URLs, plus display name and custom status |
| **Hosting** | Mostly the United States | France, European Union (GDPR) |
| **Privacy** | Varies | Memory only: nothing written to disk, no logs of who you are |
| **Reliability** | Rarely public | Checked every minute on a [public status page](https://studiozeratik.com/status/) |
| **Support** | English | English and French, by a real studio |
| **Price** | Free | Free, no sign-up or key: your Discord account is enough |

## Get started

1. **Join** the [NoryxBot](https://discord.gg/7mTwmWcfcc) or [Studio Zératik](https://discord.com/invite/asgZwmh9dT) Discord server.
   That turns it on. Leave both and tracking stops: your data is gone right away.
2. **Copy your Discord ID** (Discord settings → Advanced → Developer Mode, then right-click your name → Copy User ID).
3. **Use it**: the card, the API or the live socket below.

## The card

```html
<img src="https://presence.noryxbot.com/v1/users/YOUR_DISCORD_ID/card.svg?lang=en" alt="My Discord status" width="460" height="128">
```

Markdown (GitHub profile README):

```md
![My Discord status](https://presence.noryxbot.com/v1/users/YOUR_DISCORD_ID/card.svg)
```

| Option | Values | Default |
| --- | --- | --- |
| `lang` | `en`, `fr` | `en` |
| `theme` | `dark`, `light` | `dark` |
| `accent` | `lime`, `coral`, `blue`, `violet`, `pink`, `cyan` | `lime` |
| `size` | `card`, `compact`, `spotify` (only the music, 460 × 112) | `card` |
| `hide` | any of `activity`, `spotify`, `elapsed`, `art`, `custom`, comma-separated | — |

The [card generator](https://noryxbot.com/presence/) on the site builds the line for you.

**PNG.** Some places refuse SVG images (forums, some site builders and chat apps). Use `card.png` instead of
`card.svg`, with the same options: the same card, drawn at twice its size so it stays sharp.

```html
<img src="https://presence.noryxbot.com/v1/users/YOUR_DISCORD_ID/card.png?size=spotify" alt="What I'm listening to" width="460" height="112">
```

## Overlay for OBS

A page with a transparent background that shows the card and refreshes it every 5 seconds, without
flickering. In OBS (or Streamlabs), add a **Browser source** with this address, then set its width
(460 for the card, 340 for `compact`): the card fills it.

```text
https://presence.noryxbot.com/v1/users/YOUR_DISCORD_ID/overlay?size=spotify
```

It takes the same options as the card (`lang`, `theme`, `accent`, `size`, `hide`).

For your music to show: link Spotify to Discord (Settings → Connections → Spotify, with "Display Spotify as your
status" on), keep your activity visible, and keep Discord open while you stream. No app to create and no key.
In invisible mode your music stays private and the card shows "Not listening to anything".

## Social banner for streams

A free animated banner for OBS (or Streamlabs) that shows your networks one after the other, on a transparent
background. Keep only what you want: a single network works, and so does Spotify alone. No account: everything is in the address, nothing is stored. Add it as a **Browser source**
(about 500 × 130).

```text
https://presence.noryxbot.com/v1/widgets/socials?twitch=YourName&youtube=YourName|Main channel&discord=Your server&every=20
```

| Option | Values |
| --- | --- |
| `twitch`, `kick`, `youtube`, `tiktok`, `instagram`, `x`, `facebook`, `discord`, `threads`, `bluesky`, `github`, `steam` | Your name on that network, in the order you want. Repeat one for several accounts. `Name\|Line` adds a small line under it. Up to 12. |
| `every` | Seconds before the next network, 5 to 300 (up to 5 minutes, default 20) |
| `lang` | `en` or `fr` |
| `id` | Optional: your Discord ID. The banner then also shows you live on Discord (status or game) and the song you're listening to on Spotify. |
| `live` | With `id`: `discord` or `spotify` to keep only one. Spotify alone makes a music widget that steps aside when nothing plays. |

The [banner builder](https://noryxbot.com/presence/#socials) on the site prepares the address. Brand icons come
from [Simple Icons](https://simpleicons.org) (CC0); brand names and logos belong to their owners.

## The API

```http
GET https://presence.noryxbot.com/v1/users/YOUR_DISCORD_ID
```

```json
{
  "success": true,
  "data": {
    "discord_user": { "id": "…", "username": "…", "display_name": "…", "avatar_url": "https://cdn.discordapp.com/…" },
    "discord_status": "online",
    "custom_status": { "text": "…", "emoji": { "name": "…" } },
    "activities": [ … ],
    "listening_to_spotify": true,
    "spotify": { "song": "…", "artist": "…", "album": "…", "album_art_url": "https://…", "timestamps": { … } },
    "active_on_discord_desktop": true,
    "active_on_discord_mobile": false,
    "active_on_discord_web": false,
    "updated_at": 1794240000000
  }
}
```

The response format is compatible with Lanyard's, so an existing integration keeps working when you
change the address. Someone who hasn't joined one of the servers gets a `404` with `user_not_monitored`.

| Endpoint | Returns |
| --- | --- |
| `GET /v1/users/:id` | The person's presence |
| `GET /v1/users/:id/card.svg` | The embeddable card |
| `GET /v1/users/:id/card.png` | The same card as a PNG image |
| `GET /v1/users/:id/overlay` | Live overlay for OBS (transparent page) |
| `GET /v1/widgets/socials` | Social banner for streams |
| `GET /v1` | Service information |
| `GET /health` | `{ "ok": true }`, for monitoring |
| `WS /socket` | Live updates |

## Real time (WebSocket)

```js
const ws = new WebSocket('wss://presence.noryxbot.com/socket');
let beat;
ws.onmessage = ({ data }) => {
  const { op, t, d } = JSON.parse(data);
  if (op === 1) {
    // Hello: subscribe, then send a heartbeat at the interval asked
    ws.send(JSON.stringify({ op: 2, d: { subscribe_to_id: 'YOUR_DISCORD_ID' } }));
    beat = setInterval(() => ws.send(JSON.stringify({ op: 3 })), d.heartbeat_interval);
  }
  if (t === 'INIT_STATE' || t === 'PRESENCE_UPDATE') console.log(d.discord_status, d.activities);
};
ws.onclose = () => clearInterval(beat);
```

| Direction | Message |
| --- | --- |
| server → client | `{ "op": 1, "d": { "heartbeat_interval": 30000 } }` (hello) |
| client → server | `{ "op": 2, "d": { "subscribe_to_id": "ID" } }` or `{ "subscribe_to_ids": ["ID", …] }` |
| server → client | `{ "op": 0, "t": "INIT_STATE", "d": … }`, then `PRESENCE_UPDATE` on every change |
| server → client | `{ "op": 0, "t": "PRESENCE_REMOVE", "d": { "user_id": "ID" } }` when someone stops being tracked |
| client → server | `{ "op": 3 }` heartbeat, at least every `heartbeat_interval` |
| client → server | `{ "op": 4, "d": { "unsubscribe_from_id": "ID" } }` |

Close codes: `4001` heartbeat timeout, `4002` invalid message, `4004` unknown op, `4006` invalid subscription.
More in [`examples/`](examples/).

## Limits

- 180 requests per minute per address on the API.
- Up to 50 people per socket connection, and 20 connections per address.
- Open CORS (any website can call it), no cookies.

## Privacy

Only people who joined one of the two servers are tracked, by their own choice. What is kept: Discord ID,
username, display name, avatar, status, devices in use, activities, Spotify track and custom status.
**In memory only**: nothing is written to disk, and it is gone as soon as the person leaves both servers.
Visitor addresses are used in memory for the rate limits, never stored. Full policy:
[noryxbot.com/bot/privacy](https://noryxbot.com/bot/privacy/).

## Run it yourself

The official service at `presence.noryxbot.com` is free to use. To run your own instance (under your own
name, see [TRADEMARKS.md](TRADEMARKS.md)), you need a Discord application with **Server Members Intent**
and **Presence Intent** turned on, invited to the servers that turn tracking on (permission: View
Channels). It leaves any other server it is added to.

**With Docker**

```bash
cp .env.example .env    # then fill in PRESENCE_BOT_TOKEN and PRESENCE_GUILD_IDS
docker build -t presence .
docker run -d --name presence --env-file .env -e HOST=0.0.0.0 -p 127.0.0.1:3007:3007 --restart unless-stopped presence
```

**With Node.js 24+**

```bash
npm install
cp .env.example .env    # then fill in PRESENCE_BOT_TOKEN and PRESENCE_GUILD_IDS
npm run dev             # http://localhost:3007/v1
npm test
npm run build && npm start
```

Put it behind a reverse proxy with HTTPS: forward WebSocket upgrades on `/socket`, and always set
`CF-Connecting-IP` to the visitor's address (the rate limits use it), so nobody can choose their own.

## Contributing and security

Ideas and fixes are welcome: see [CONTRIBUTING.md](CONTRIBUTING.md). To report a security issue, please
don't open a public issue: see [SECURITY.md](SECURITY.md).

## Licence

The code is free software under the **GNU Affero General Public License v3.0** ([LICENSE](LICENSE)): you
can use, study, change and share it. If you run a changed version as a network service for others, you
must offer them its source code under the same licence. Using the public API or the card is not affected.

"NoryxBot", "NoryxBot Presence", "Studio Zératik" and their logos are trademarks of Studio Zératik inc.
and are not covered by the licence: see [TRADEMARKS.md](TRADEMARKS.md).

© 2026 Studio Zératik inc.
