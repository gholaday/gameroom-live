# Handoff: Couch (retro netplay web app)

You're building **Couch** (working name), a friends-only web app for playing retro console games together over the internet, Parsec-style, entirely in the browser. The host runs the emulator and streams video and audio to guests over WebRTC. Guests send controller input back. Guests need no account, no install, and no ROM.

## Read first

1. `docs/design.md` is the full design doc: architecture, input protocol, latency budget, risks, and milestones. Treat it as the source of truth.
2. `docs/mockups/` holds the three approved screens (`S-Host.dc.html`, `S-Join.dc.html`, `S-Play.dc.html`). They're written in a custom component format, so use them as a visual and markup reference only. Don't try to run them. Rebuild them as real React components.

## Prior art worth reading before milestone 1

- **kaillera-next** (github.com/kwilson21/kaillera-next) has a streaming mode where the host's EmulatorJS canvas goes to guests as a WebRTC MediaStream. Read its streaming engine.
- **koin.js netplay PR #9** (github.com/muditjuneja/koin/pull/9) is built on Nostalgist and includes an audio tap module (`src/netplay/media/audio-tap.ts`). Audio capture is our biggest risk, so study this one closely.

Borrow ideas, but check licenses before copying any code.

## Stack

- Next.js (App Router), TypeScript, Tailwind, shadcn/ui primitives where they fit, deployed on Vercel
- Emulation: libretro WASM cores via Nostalgist.js (fall back to EmulatorJS if Nostalgist blocks us)
- Signaling: PeerJS cloud to start
- TURN: Cloudflare TURN (credentials come from env vars, never hard-coded)
- Storage: host-side IndexedDB only. No database, no accounts.
- COOP `same-origin` and COEP `require-corp` headers from day one in `next.config`

## UI style: "Console Home"

A clean console home screen look: light, rounded, roomy, built to be driven by a controller. This is an original design. Don't use any Nintendo branding, logos, or exact copies of their UI.

### Tokens

Put these in Tailwind theme config and CSS variables.

| Token | Value | Use |
|---|---|---|
| `bg` | `#EDEDEF` | App background |
| `surface` | `#FFFFFF` | Cards, round buttons, tiles |
| `panel` | `#F4F4F6` | In-game side menu |
| `game-bg` | `#101012` | Behind the game stream |
| `text` | `#2B2B2E` | Primary text, button-hint glyphs |
| `text-muted` | `#5C5C63` | Secondary text |
| `line` | `#CFCFD4` | Footer divider |
| `line-soft` | `#DADADF` | Divider inside panels |
| `slot-empty` | `#A9A9B0` | Dashed empty-slot borders |
| `focus` | `#2D7FF0` | Selection ring (never used for text) |
| `primary-text` | `#1A5FC0` | Selected titles, links, primary buttons |
| `ok` | `#2DB36B` | Connected and hosting dots |
| `danger` | `#C0322A` | End session |
| `p1` | `#E5603F` | Player 1, white text |
| `p2` | `#1F9E89` | Player 2, white text |
| `p3` | `#7A5AF0` | Player 3, white text |
| `p4` | `#E0A21B` | Player 4, dark text |

- **Font:** Nunito, weights 600, 700, and 800, loaded with `next/font`
- **Radii:** game tiles 14px, cards 18px, side menu 22px on the left corners, pills and avatars fully round
- **Shadows:** soft only, e.g. `0 2px 6px rgba(0,0,0,0.08)`. The selected tile gets `0 10px 24px rgba(0,0,0,0.18)`.
- **Selection ring:** `outline: 5px solid focus; outline-offset: 5px` on tiles, 4px with a 2px offset on menu rows. It's the single most important visual element in this style.
- **Icons:** inline stroke SVGs (lucide-react works). No emoji.
- **Copy rules:** no em dashes and no middle-dot separators anywhere in UI text. Use separate elements and spacing instead.

### Screens

1. **Host home** (`/`)
   - Top bar: four round player avatars (filled with the player color and an initial, dashed when empty) on the left. "Hosting" and "Room K7QX" pills on the right.
   - Selected game title in `primary-text` above a horizontal tile row. The selected tile is larger (250px versus 210px) with the focus ring. The last tile is a dashed "Open ROM file" tile.
   - Round 64px shortcut buttons with labels below: Invite, Players, Saves, Settings.
   - Invite card: QR code, the room link in a pill input, and a Copy button.
   - Footer: a status line on the left and controller hints on the right (A Start, X Invite, B End session), drawn as dark circles with white letters.
2. **Guest join** (`/r/[code]`)
   - "Garrett invited you to play", then the game title, then the live stream preview with a "Live" pill.
   - A row of four 84px player slots. The guest's own slot has a pulsing focus ring and "Press any button".
   - Pill buttons: Touch controls, Keyboard, Just watch.
   - Footer: connection status and latency on the left, hints (A Join, B Just watch) on the right.
3. **In-game menu** (an overlay on the play screen)
   - The game stream is centered on `game-bg` with a small latency and fps pill top-left.
   - Opening the menu (Start or Esc) dims the game and slides in a panel from the right: system and title, the player list with latency colored by quality, then Resume, Save state, Load state, Invite friends, End session.
   - Hints at the bottom of the panel: B Back, A OK.

### Controller navigation

This style only works if the UI is fully navigable with a gamepad.

- Build a small spatial focus manager: the D-pad or left stick moves focus between focusable elements, A activates, B goes back. Arrow keys, Enter, and Escape do the same on keyboard.
- Focus state is the selection ring. Make sure `:focus-visible` and controller focus look identical.
- While a game is running, gamepad input goes to the game, not the UI. Only Start or Home opens the menu.

## Milestones for this session

Do these in order. Stop after each one and tell me how to test it in Chrome before moving on.

### 0. Scaffold
- Next.js app with the tokens, Nunito, and COOP/COEP headers
- Static versions of all three screens matching the mockups, with fake data
- The focus manager working with keyboard and a gamepad on the host home and the in-game menu
- **Done when:** I can drive the host home and menu entirely with a controller, and `crossOriginIsolated` is `true` in the console.

### 1. Local spike
- Load a SNES ROM from a file picker, run it via Nostalgist, capture the canvas with `captureStream(60)`, and play that stream in a `<video>` on the same page
- Route emulator audio into a `MediaStreamAudioDestinationNode` and confirm it's in the stream
- **Done when:** the `<video>` shows smooth 60 fps with audio, and you've written down what worked and what didn't for audio capture.

### 2. Two-player SNES
- PeerJS room codes, `/r/[code]` join flow, host streams to one guest
- Input DataChannel (`ordered: false, maxRetransmits: 0`) with the 8-byte packet from the design doc, sent every frame
- Guest gamepad maps to P2. Latency pill shows live RTT.
- **Done when:** two Chrome windows (one incognito) can play a 2P SNES game with no stuck buttons, and the latency pill updates.

Later milestones (polish, PS1, N64, save states) are in the design doc. Don't start them this session.

## Working rules

- Performance is a top priority. Keep the emulator off the main thread where you can, avoid React re-renders in the frame loop, and never buffer frames on the guest.
- Keep dependencies light, since COEP blocks third-party resources that lack CORP headers.
- Never commit ROMs, BIOS files, or TURN credentials. Add `*.sfc`, `*.smc`, `*.z64`, `*.n64`, `*.chd`, `*.bin`, and `*.cue` to `.gitignore`.
- Commit at the end of each milestone with a clear message.
- If something in the design doc turns out wrong in practice, tell me and propose a change rather than silently working around it.
