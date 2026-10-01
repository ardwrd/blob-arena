# Blob Arena

A lightweight browser arena game inspired by the eat-grow-split loop of Agar-style games, built with plain HTML, CSS, JavaScript, and Canvas.

## V2 gameplay

- Pointer and touch movement
- Large scrolling arena with camera zoom
- Food pellets and growth
- Multi-cell player model
- **SPACE** to split toward the pointer
- Split momentum and delayed merging
- Maximum 16 cells
- **W** to eject / feed mass
- Ejected mass can be eaten by players, bots, or viruses
- Green viruses act as cover for small cells
- Cells at roughly 132+ mass can swallow a virus and explode into multiple cells
- Feeding a virus repeatedly makes it launch another virus
- AI bots hunt, flee, split-attack, eat, and avoid dangerous viruses
- Eat-or-be-eaten collision rules
- Edge/corner capture handling
- Live leaderboard based on total mass
- Death and respawn
- Responsive desktop and mobile action buttons
- Runs entirely in the browser

## Controls

| Action | Desktop | Touch |
| --- | --- | --- |
| Move | Pointer | Drag / move touch |
| Split | `Space` | `SPLIT` button |
| Feed / eject mass | `W` | `FEED` button |

## Run locally

Because the game uses JavaScript modules, serve the repository with a small static server instead of opening `index.html` directly.

```bash
python -m http.server 8080
```

Then open `http://localhost:8080`.

## Stack

- HTML5 Canvas
- CSS
- Vanilla JavaScript (ES modules)

## Architecture

The player and bots are actors that can own multiple independent cells. Each cell has its own mass, radius, position, split momentum, and merge timer. Persistent multiplayer state is intentionally out of scope for this version.

## Roadmap

Possible later experiments: smarter tactical bots, skins, custom game modes, spectator mode, multiplayer rooms, and server-authoritative gameplay.

## License

MIT
