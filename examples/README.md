# Examples

Replace `YOUR_DISCORD_ID` with your Discord user ID. You must be a member of the NoryxBot or Studio
Zératik Discord server for your presence to be available.

## The card (no code)

HTML, for any website (Wix, WordPress, Carrd, Notion "embed"…):

```html
<img src="https://presence.noryxbot.com/v1/users/YOUR_DISCORD_ID/card.svg?theme=dark&accent=lime" alt="My Discord status" width="460" height="128">
```

Markdown, for a GitHub profile README:

```md
![My Discord status](https://presence.noryxbot.com/v1/users/YOUR_DISCORD_ID/card.svg?size=compact)
```

## One request (JavaScript)

```js
const res = await fetch('https://presence.noryxbot.com/v1/users/YOUR_DISCORD_ID');
const { success, data } = await res.json();
if (success) console.log(`${data.discord_user.display_name} is ${data.discord_status}`);
```

## Live widget

[`live.html`](live.html): a complete page that shows your avatar, status, game and Spotify track, and
updates the moment they change (WebSocket, with automatic reconnection). Open it in a browser.
