# Milestone 4 notes (systems pass, save states)

## Systems

All per-system differences live in `lib/emulator/systems.ts`: core, file
extensions, stream size (native resolution at an integer scale), player count,
touch pad buttons and extra RetroArch config. Everything else (stream, input,
overlay, reconnect, library) is shared.

| System | Core | Stream | Players |
|---|---|---|---|
| SNES | snes9x | 512x448 (2x) | 4, multitap in port 2 |
| NES | fceumm | 512x480 (2x) | 4, Four Score by checksum |
| Genesis | genesis_plus_gx | 640x448 (2x) | 2 |
| N64 | mupen64plus_next | 640x480 | 4 (guest sticks not yet) |
| Game Boy / Color | gambatte | 480x432 (3x) | 1 |
| Game Boy Advance | mgba | 720x480 (3x) | 1 |

- 1-player systems are watch-only for guests. The lobby says so and hides the
  input buttons.
- Genesis A, B, C map to RetroPad Y, B, A (genesis_plus_gx's layout). The touch
  pad shows the console's own labels.
- Players 3 and 4 are bound to the number pad and the digit row. Nostalgist
  already turns off the RetroArch hotkeys those could hit.
- NES: fceumm plugs in the Four Score for 4-player games it knows by CRC
  (`fourscore_db_list`) when ports 3 and 4 are on Auto. Other games ignore
  players 3 and 4, so NES always offers 4 slots.
- Genesis stays at 2. Team Player and EA 4-Way Play exist in genesis_plus_gx
  (device ids 1537 and 1025, from its libretro.c), but nothing detects which a
  game wants, and the wrong one can unplug player 1. Skipped for now.
- N64: mupen64plus_next isn't in the RetroArch 1.22.2 emscripten build, but
  the same author publishes one built against 1.22.2 in the
  `retroassembly-custom-cores` npm package. `core-build.json` names that
  source and `fetch-cores` downloads it like the others. The host plays with a
  real stick through RetroArch's gamepad input. Guests' input goes in as
  keyboard presses, so their sticks don't drive the N64 stick yet, and the
  touch pad has no Z or C buttons.
- Not supported: PS1 (pcsx_rearmed exists; disc images and BIOS need their
  own work). A PS1 folder's `.bin`
  tracks are skipped when a `.cue` or other disc index sits beside them, and a
  `.bin` over 16 MB opened by hand is refused as a CD image.

## Cover art

Box art comes from libretro-thumbnails on GitHub, keyed by the ROM's No-Intro
file name (`lib/library/covers.ts`). GitHub sends
`cross-origin-resource-policy: cross-origin`, so a plain `<img>` works under
COEP. If the image is missing, the generated initials tile stays.

## Save states

- 4 slots per game in IndexedDB (`saves` store, keyed by ROM file name).
- Thumbnails come from the outgoing video track with `ImageCapture.grabFrame()`.
  That returns the last frame even while the game is paused for the menu, and
  adds no work to the emulator. Reading the WebGL canvas directly gives a blank
  image.
- Nostalgist saves and loads through one shared state file, so overlapping
  operations clobber each other. All state operations (slot save, slot load,
  10 s autosave) run one at a time through a queue in the host session.
- RetroArch handles save and load commands in its frame loop. A hidden or
  unpainted tab runs no frames, so state operations wait. Autosave skips hidden
  tabs, and the save-on-hide from milestone 3 is gone for this reason.

## Fixes

- Esc, arrows and Enter on the host's play screen: RetroArch's key handler on
  `document` marks every key as handled. Keyboard nav now listens in the
  capture phase on `window`, and keeps nav keys from reaching the emulator.
- Leaving `/play` pauses the game. The session owns the canvas, so coming back
  re-attaches the same running framebuffer instead of a blank one.
- The wake lock is held by the session (with refusal handled) instead of by
  RetroArch, whose request threw unhandled rejections.

## Controls (milestone 5)

- Mappings live in localStorage (`lib/input/controls.ts`): one keyboard map,
  and one map per gamepad model (`Gamepad.id`). Binding a key or button that
  another button already has swaps the two, so nothing silently loses its
  binding. A button can end up unbound ("None") if it swapped with one that had
  nothing.
- Guests: their input already goes through our code, so mappings apply right
  away. The input loop reads cached lookup tables, never the stored maps.
- Host: player 1 plays through RetroArch's own input, the lowest-latency path.
  The mapping becomes `input_player1_*` config at boot, for the first connected
  controller, so changes apply from the next game start. Keys used to inject
  players 2 to 4, plus Esc and F1, are refused.
- While a row waits for input, `suspendNav()` turns keyboard and gamepad
  navigation off. Button state is still tracked, so the button you just bound
  doesn't count as a fresh press when navigation resumes.
- Untested: the host's controller mapping assumes RetroArch's web gamepad
  driver uses Standard Gamepad button indices for `input_player1_*_btn`.

## Home, chat and rooms (after milestone 5)

- Home shows the library as cartridges on shelves, one per system, drawn to
  the console's real cart size (`components/cartridge.tsx`). Picking one slides
  it into the console on the right; picking it again or pressing Start starts
  it. End session lives on the console.
- The library is deduped by file name, so loading the same folder twice adds
  nothing.
- The host plays at the room link `/r/CODE`. The tab hosting a room keeps the
  code in sessionStorage (`lib/host/room-tab.ts`), so a reload of that tab gets
  the game and any other tab gets the join page. `/play` is only used until the
  room opens (offline), then the URL is swapped in place.
- The Esc menu no longer pauses the game. It has a chat (protocol messages
  `say` and `chat`, last 50 lines sent in `welcome`) and a rename pencil.
  Closed, chat lines toast in on the right and joins and leaves on the left.
- Audio widget in the bottom right of both play screens: mute and a volume
  slider, per device in localStorage. The host's level only changes its own
  speakers, never the stream.
- Full rooms: the signaling Worker allows 16 peers per room and answers
  "Room is full" past that; the guest shows it as a sentence. When every player
  slot is taken the lobby says so and only offers watching.
