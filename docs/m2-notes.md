# Milestone 2 notes

Two-player SNES over WebRTC: room codes, guest join, host-to-guest stream,
guest input to player 2, live RTT, and spectators.

## Architecture

- **PeerJS is used for signaling and the first handshake only.** Its
  `reliable: false` gives `ordered: false` but still retransmits, and each of
  its data and media connections opens its own RTCPeerConnection. We take the
  RTCPeerConnection from the guest's PeerJS DataConnection (which doubles as
  the reliable JSON control channel) and run everything else on it
  (`lib/net/link.ts`):
  - **Input channel:** pre-negotiated (`negotiated: true, id: 100`,
    `ordered: false, maxRetransmits: 0`). It never fires `datachannel`, so
    PeerJS never touches it.
  - **Media:** the host adds `sendonly` audio and video transceivers, prefers
    H.264 with `setCodecPreferences`, and renegotiates over the control
    channel. Only the host offers, so offers never collide.
  - **Sender:** `degradationPreference: maintain-framerate`, 4 Mbps cap,
    60 fps, high priority.
  - **Receiver:** `jitterBufferTarget = 0`.
- **Input:** the guest sends the full 8-byte state each display frame, or
  immediately on a key event in keyboard mode. The host checks seq, then
  applies only the edges (`lib/emulator/injector.ts`), by calling RetroArch's
  key handlers directly with fixed player 2 bindings. If a player's packets
  stop for 250 ms, the host releases all their buttons.
- **RTT:** 9-byte ping and pong on the input channel every 500 ms. Each side
  times its own pings, so clocks never need to agree.
- **Spectators:** every guest gets the stream on connect. Claiming a slot is
  optional, so in a one-player game everyone else watches. Up to 7 guests
  (`MAX_GUESTS`); each one costs the host an encode.
- **TURN:** `/api/ice` mints Cloudflare TURN credentials from
  `CLOUDFLARE_TURN_KEY_ID` and `CLOUDFLARE_TURN_API_TOKEN` (see
  `.env.example`), and falls back to STUN only.

## Measured (same machine, browser pane hidden so throttled)

- H.264 (`profile-level-id=42001f`, `packetization-mode=1`) at 512x448.
  Opus audio.
- Guest video jitter buffer averages about 4 ms, audio about 19 ms. 0 packets
  lost, 0 frames dropped.
- Guest keyboard Start and A arrived at the host as player 2 press and release
  edges.

## Found along the way

- **RetroArch 1.22 sizes its framebuffer with a ResizeObserver**
  (`devicePixelContentBoxSize`), so a CSS-scaled canvas made the stream as big
  as the window. `lib/emulator/pin-canvas.ts` wraps `ResizeObserver` so a
  pinned canvas always reports 512x448. The host view scales freely and the
  stream stays at exactly 2x native.
- **The host's game tab must stay visible.** RetroArch runs on
  requestAnimationFrame, which Chrome pauses in background tabs, so the game
  and the stream freeze. A small window or a second monitor is fine; a hidden
  tab is not.
- **Sampling keys once per frame lost quick taps.** Keyboard input now sends on
  the key event, which also saves up to one frame of latency.
- **Join page and Suspense.** Under Cache Components, route params need a
  Suspense boundary, and React only reveals it when rAF fires. The join page
  reads the code from `location` instead, so it's a static shell.
- **Autoplay.** Gamepad presses don't count as a user gesture, so a guest
  using only a controller may get muted video. A "Click for sound" button
  appears when that happens.

## Change from the handoff to approve

**Menu button.** The handoff says Start opens the in-game menu, but games need
Start. In game mode the menu is now **Home**, **Select+Start**, or **Esc**.
Plain Start goes to the game.

## Testing

```bash
npm run dev
```

1. Host: open `http://localhost:3000`, then Open ROM file and pick a `.sfc`.
   In dev, `/?rom=<file in /roms>` loads one without the picker. Press A or
   Enter on the tile.
2. Guest: open the room link in another window (incognito works), then press
   any controller button, or click Keyboard. Use Just watch to spectate.
3. The pill top-left shows RTT and fps. Esc, Home, or Select+Start opens the
   menu.

## Spectator overlay: hands and ink

Anyone in the room, player or spectator, can point and draw on the game with a
mouse or touch. Everyone else sees a hand in that person's color with their
name, plus the ink, which fades out after 4 seconds.

- **Transport:** two more pre-negotiated channels on each guest's connection.
  - `cursor` (id 101) is unordered with no retransmits. Each packet is 7 bytes
    and the newest wins. Sent at most every 33 ms.
  - `ink` (id 102) is reliable and ordered. It carries batches of up to 64
    points.

  Coordinates are normalized to the game frame, so every screen size lines up.
- **Relay:** guests send to the host. The host stamps the sender's id into the
  packet, draws it, and forwards the same buffer to every other guest. The
  host's own pointer goes out as peer 0. A `peers` control message carries
  names, slots and each guest's own id, so colors match everywhere: players
  use their slot color, spectators a palette.
- **Cost:** the overlay is plain DOM and canvas outside React
  (`lib/overlay/controller.ts`). Hands move with `transform`, all ink is one
  2D canvas, and the rAF loop only runs while a hand is moving or ink is
  fading. Sends ride that loop, so a fast mouse can't flood the channel.
- **Fit:** the overlay sits on the picture's box inside the `object-contain`
  frame, computed from the frame's intrinsic size, not its CSS box.
