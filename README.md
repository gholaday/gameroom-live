# Gameroom Live

Friends-only retro netplay in the browser. The host runs the emulator and streams
video and audio to guests over WebRTC; guests send controller input back.

See `docs/claude-code-handoff.md` for the plan and `docs/mockups/` for the approved screens.

## Run

```bash
npm install
npm run dev
```

## Routes

| Route | Screen |
|---|---|
| `/` | Host home |
| `/r/[code]` | Guest join |
| `/play` | Play screen with the in-game menu (Start or Esc) |

## Controls

| Input | Keyboard | Gamepad (standard mapping) |
|---|---|---|
| Move focus | Arrow keys | D-pad or left stick |
| OK | Enter | A (bottom face button) |
| Back | Escape | B (right face button) |
| Invite (host home) | | X |
| Start game / open menu | Escape (in game) | Start or Home |

While a game is running the UI ignores the controller except Start / Home (and Escape).

## Code map

- `lib/nav/manager.ts` spatial focus manager (keyboard and gamepad), no React
- `lib/nav/react.tsx` hooks: `useNavAction`, `useGameMode`, `useInitialFocus`
- `app/globals.css` Console Home tokens and the selection ring
- `components/` the three screens and shared UI bits
- `next.config.ts` COOP / COEP headers (cross-origin isolation)
