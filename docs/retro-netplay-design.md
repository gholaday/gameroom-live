# Retro Netplay — Design Doc

*Working name. A friends-only web app for playing retro console games together over the internet, Parsec-style, entirely in the browser.*

## 1. Goals

- **Easy to use:** a guest clicks a link and is playing in seconds. No install, no account, no ROM on their side.
- **Very performant:** input-to-photon latency low enough that co-op and party games feel local on a decent connection.
- **Small and cheap:** a handful of friends, near-zero infrastructure, no database.

### Non-goals

- Public product, accounts, matchmaking, or a ROM library hosted by the app
- Tournament-grade fighting-game netcode (that's rollback territory, e.g. Fightcade)
- Anything newer than N64 / PS1
- Voice chat (players use Discord or similar)

## 2. Supported systems

| System | Core (libretro, WASM) | Notes |
|---|---|---|
| NES | fceumm / nestopia | Trivial load |
| SNES | snes9x | Trivial load |
| Genesis / Mega Drive | genesis_plus_gx | Trivial load |
| GB / GBC / GBA | gambatte, mgba | Trivial load |
| PS1 | pcsx_rearmed (or beetle_psx) | Host supplies BIOS; multi-disc |
| N64 | mupen64plus_next | WebGL, threads; needs a decent host PC; a few problem games |

All systems use the libretro **RetroPad** abstraction, so the input protocol is identical everywhere.

## 3. Architecture (stream model)

```
 HOST BROWSER                                   GUEST BROWSER(S)
 ┌──────────────────────────┐                   ┌───────────────────────┐
 │ ROM (local file)          │                   │ <video> (pixelated)    │
 │ Emulator core (main thr.) │── video+audio ──▶│ Gamepad / touch / kbd  │
 │ Canvas → captureStream    │   (WebRTC media)  │                        │
 │ Input mixer (P1–P4)       │◀── input ────────│ Input sender (60 Hz)   │
 └──────────────────────────┘   (DataChannel)   └───────────────────────┘
            │                                               │
            └────────── signaling (room code) ──────────────┘
                     + STUN/TURN for NAT traversal
```

- **Host** runs the emulator, owns the ROM and saves, and streams to every guest.
- **Guests** only decode video and send inputs, so a weak laptop or phone works.
- **Topology:** mesh from host to each guest (max 3 guests). The host encodes once per guest, which is fine at retro resolutions.

## 4. Session flow

1. Host opens the site → picks a recent game or a ROM file (+ BIOS for PS1).
2. Game boots paused; a room link, a copy button and a QR code appear.
3. Guest opens the link → connects peer-to-peer → sees the live screen.
4. Guest presses any button on a controller (or taps the touch pad) → claims the next free player slot.
5. Host unpauses. Host can reassign or kick slots at any time.
6. On disconnect, guests auto-reconnect to the same slot for ~60 s.
7. When the host leaves, the session ends. There is no host handoff.
   - **Grace period:** if the host drops unexpectedly (refresh, crash, Wi-Fi blip), guests see "Waiting for host…" for ~30 s and keep their slots.
   - **Host rejoin:** the host's browser remembers the room ID (sessionStorage), so reopening the page reclaims the same room and link.
   - **Resume:** the host auto-saves a state to IndexedDB about once a minute (each save briefly stalls the core), so a rejoin resumes near where play stopped.
   - **Deliberate exit:** an explicit "End session" button skips the grace period.
   - If the host doesn't return in time, guests see "Host ended the session" and the room link stops working.

## 5. Performance

### Latency budget (good connection, ~30 ms RTT)

| Stage | Target |
|---|---|
| Guest input → host | ~15 ms (half RTT) |
| Wait for next emulated frame | 0–16 ms |
| Capture + hardware encode | 3–8 ms |
| Host → guest network | ~15 ms |
| Jitter buffer | ~0 ms |
| Decode + display | 5–15 ms |
| **Total** | **~40–70 ms** |

### Techniques

- **Emulator on the main thread, UI kept out of its way:** RetroArch's Emscripten build (Nostalgist and EmulatorJS alike) needs a DOM canvas and runs its own requestAnimationFrame main loop, so it can't move to a Worker. While a game runs, the play screen's React tree stays static and nothing re-renders per frame. If jank shows up, isolate the emulator in a cross-origin iframe (its own process). See `docs/m1-spike-notes.md`.
- **Tiny streams:** stream at native resolution × an integer scale (2x for 2D systems, ~640×480 for N64/PS1). Upscale on the guest with `image-rendering: pixelated`.
- **Codec:** prefer H.264 through `setCodecPreferences`, since hardware encode is the most common. VP8 is the fallback.
- **Encoder settings:** `contentHint = 'motion'`, `degradationPreference = 'maintain-framerate'`, and a capped `maxBitrate` that adapts to the connection.
- **No buffering on the guest:** `jitterBufferTarget = 0`; drop late frames rather than queue them.
- **Inputs:** unordered, unreliable DataChannel (`ordered: false, maxRetransmits: 0`). The host applies the newest packet per player at the start of each frame.
- **Frame pacing:** RetroArch drives frames from `requestAnimationFrame` and throttles to the core's rate via audio sync. Verify on high-refresh displays that emulation stays at 60 Hz (50 for PAL).
- **Measurement built in:** a DataChannel ping shows each player's RTT and an estimated total latency in a small overlay.

## 6. Input protocol

One 8-byte packet per player, sent every frame and immediately on change:

| Bytes | Field | Notes |
|---|---|---|
| 0–1 | `seq` (uint16) | Host ignores older packets |
| 2–3 | `buttons` (uint16) | RetroPad bitmask: B, Y, Select, Start, D-pad ×4, A, X, L, R, L2, R2, L3, R3 |
| 4–5 | left stick x, y (int8) | N64 stick, DualShock left |
| 6–7 | right stick x, y (int8) | N64 C-buttons, DualShock right |

- Sending the full state (not press/release events) means a dropped packet can never cause a stuck button.
- If no packet arrives from a player for ~250 ms, the host zeroes their input.

## 7. Video and audio pipeline

- **Video:** canvas → `captureStream(60)` → WebRTC track. RetroArch sizes its framebuffer from the canvas's CSS box, so pin it to native × integer scale and use `aspect_ratio_index: 21` (square pixels). For WebGL cores (N64, some PS1 renderers) use `preserveDrawingBuffer: true`, or capture right after present, to avoid blank frames.
- **Audio:** RetroArch's RWebAudio driver creates its own AudioContext and connects a new buffer source to `destination` per chunk. Before boot, wrap `AudioContext` and patch `AudioNode.prototype.connect` so those connections go to a bus that feeds both the speakers and a `MediaStreamAudioDestinationNode` → WebRTC audio track (Opus). The host hears local output directly, never the round-tripped stream. Proven in the milestone 1 spike.

## 8. Ease of use details

- **Zero setup for guests:** link or QR code, no account, no download, no ROM.
- **"Press any button to join"** auto-detects the Gamepad API controller and assigns a slot.
- **Sensible default mappings** per system (e.g. N64 C-buttons on the right stick, Z on the left trigger); remapping is optional.
- **Touch controls** on phones, with a per-system layout.
- **Host library:** remember recently used ROMs via File System Access API handles (Chromium), with a plain file-picker fallback.
- **Save states:** quick save/load slots stored in host IndexedDB; PS1 memory cards and in-game saves persist automatically.
- **Clear status:** a connection-quality dot per player, plus a host-requirements note for N64.

## 9. Tech stack

- **App:** Next.js (App Router), shadcn/ui, Tailwind, deployed on Vercel
- **Emulation:** libretro WASM cores via Nostalgist.js or EmulatorJS
- **Signaling:** PeerJS cloud to start; PartyKit or a Cloudflare Durable Object if it gets flaky
- **NAT traversal:** Cloudflare TURN (free tier is plenty for friends)
- **Headers:** COOP `same-origin` + COEP `require-corp` from day one (threaded cores need `SharedArrayBuffer`)
- **Storage:** host-side IndexedDB only; no server database

## 10. Risks

| Risk | Mitigation |
|---|---|
| Capturing emulator audio | Solved in the spike: AudioContext wrap plus connect() reroute |
| Codec smearing on pixel art | Integer-scale stream, higher bitrate floor for 2D systems |
| N64 performance on the host | Curate a "known good" list; show host-requirements note |
| Strict NAT / corporate networks | TURN relay always configured |
| COEP breaking third-party scripts | Keep the app dependency-light; self-host assets |
| Safari quirks (WebRTC, gamepads) | Target Chromium for the host; test Safari as a guest only |

## 11. Milestones

1. **Spike:** SNES core, local capture → `<video>` on the same page. Validate audio capture. (Done)
2. **Two-player SNES:** PeerJS room link, stream to one guest, guest gamepad input.
3. **Polish the core loop:** player slots, latency overlay, reconnect, touch controls.
4. **Systems pass:** NES, Genesis, GB/GBA, then PS1 (BIOS + discs), then N64 (analog, WebGL capture).
5. **Quality of life:** recent-games library, save states, QR join, remapping.

## 12. Open questions

- **Name and domain:** a subdomain under holaday.dev, or its own name?
- **Host device:** desktop Chromium only, or should a strong phone be able to host?
- **Spectators:** allow more than three guests in a watch-only mode?
- **Host input:** host plays with keyboard and gamepad as P1 by default, or can opt out?
- **Latency target:** what number counts as "feels local" for you — set a hard budget to test against.
- **Mixed systems:** any reason to support more than one game per room (e.g. a game-picker lobby the guests can vote on)?
