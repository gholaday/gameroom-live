# Milestone 4 notes (systems pass, save states)

## Systems

All per-system differences live in `lib/emulator/systems.ts`: core, file
extensions, stream size (native resolution at an integer scale), player count,
touch pad buttons and extra RetroArch config. Everything else (stream, input,
overlay, reconnect, library) is shared.

| System | Core | Stream | Players |
|---|---|---|---|
| SNES | snes9x | 512x448 (2x) | 4, multitap in port 2 |
| NES | fceumm | 512x480 (2x) | 2 |
| Genesis | genesis_plus_gx | 640x448 (2x) | 2 |
| Game Boy / Color | gambatte | 480x432 (3x) | 1 |
| Game Boy Advance | mgba | 720x480 (3x) | 1 |

- 1-player systems are watch-only for guests. The lobby says so and hides the
  input buttons.
- Genesis A, B, C map to RetroPad Y, B, A (genesis_plus_gx's layout). The touch
  pad shows the console's own labels.
- Players 3 and 4 are bound to the number pad and the digit row. Nostalgist
  already turns off the RetroArch hotkeys those could hit.
- NES Four Score and Genesis 4-way play aren't set up yet, so those stay at 2.

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
