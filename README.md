# Blob Arena

A lightweight browser arena game where blobs grow, hunt, and survive.

Blob Arena is a small Agar-like experiment built with plain HTML, CSS, JavaScript, and Canvas. The first version is intentionally client-side only: no account, database, framework, or game server is required.

## V1

- Pointer and touch movement
- Large scrolling arena with camera zoom
- Food pellets and growth
- AI-controlled enemy blobs
- Eat-or-be-eaten collision rules
- Live leaderboard
- Death and instant respawn
- Responsive desktop and mobile controls
- Runs entirely in the browser

## Run locally

Because the game uses JavaScript modules, serve the repository with any small static server instead of opening `index.html` directly.

```bash
python -m http.server 8080
```

Then open `http://localhost:8080`.

## Stack

- HTML5 Canvas
- CSS
- Vanilla JavaScript (ES modules)

## Roadmap

Possible later experiments: split mechanics, eject mass, smarter bots, skins, power-ups, multiplayer rooms, and server-authoritative gameplay.

## License

MIT
