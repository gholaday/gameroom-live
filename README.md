# Gameroom Live

Friends-only retro netplay in the browser. The host runs the emulator and streams
video and audio to guests over WebRTC; guests send controller input back.

See `docs/claude-code-handoff.md` for the plan and `docs/mockups/` for the approved screens.

## Run

```bash
npm install
npm run dev   # also downloads emulator cores into public/cores
npm test
```

Optional TURN: copy `.env.example` to `.env.local` and fill in Cloudflare TURN credentials.
Dev shortcut: `/?rom=<file in /roms>` loads a test ROM on the host home.

## Routes

| Route | Screen |
|---|---|
| `/` | Host home |
| `/r/[code]` | Guest lobby, then fullscreen play or spectate |
| `/play` | Host play screen with the in-game menu |
| `/spike` | Milestone 1 capture spike (`?rom=<file in /roms>` in dev) |

## Controls

| Input | Keyboard | Gamepad (standard mapping) |
|---|---|---|
| Move focus | Arrow keys | D-pad or left stick |
| OK | Enter | A (bottom face button) |
| Back | Escape | B (right face button) |
| Invite (host home) | | X |
| Start game (host home) | | Start |
| In-game menu | Escape | Home, or Select+Start |

While a game is running the UI ignores the controller except the menu combo, so Start reaches the game.

## Code map

- `lib/nav/manager.ts` spatial focus manager (keyboard and gamepad), no React
- `lib/nav/react.tsx` hooks: `useNavAction`, `useGameMode`, `useInitialFocus`
- `app/globals.css` Console Home tokens and the selection ring
- `components/` the three screens and shared UI bits
- `next.config.ts` COOP / COEP headers (cross-origin isolation)
- `lib/emulator/` audio tap, canvas pinning, input injection; see `docs/m1-spike-notes.md`
- `lib/net/` wire protocol, PeerLink (one RTCPeerConnection per guest); see `docs/m2-notes.md`
- `lib/host/session.ts`, `lib/guest/session.ts` room state outside React
- `scripts/fetch-cores.mjs` self-hosts libretro cores
