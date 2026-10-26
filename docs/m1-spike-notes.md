# Milestone 1 spike notes

Spike page: `/spike`. It boots a SNES ROM with Nostalgist (snes9x), captures the
canvas with `captureStream(60)`, taps the emulator audio into the same
MediaStream, and plays that stream in a `<video>` beside the canvas.

Dev shortcut: `/spike?rom=<file name in /roms>` boots without the file picker
(served by `app/dev/roms/[name]/route.ts`, which returns 404 outside `next dev`).

## Audio capture: what worked

**The design doc's assumption was wrong.** It expected the core to output through
OpenAL with a single node we could tap. The RetroArch Emscripten build that
Nostalgist ships (v1.22.2) uses its **RWebAudio** driver instead:

- `RWebAudioInit` does `new (window.AudioContext || window.webkitAudioContext)`
  and keeps the context in a closure (`RWA.context`). We can't reach it.
- For every audio chunk, `RWebAudioQueueBuffer` creates a new
  `AudioBufferSourceNode` and calls `.connect(RWA.context.destination)`.
  So there's no long-lived node to tap.

What works (`lib/emulator/audio-tap.ts`), installed **before** the core boots:

1. Replace `window.AudioContext` with a subclass. Its constructor builds a bus:
   `bus GainNode -> local GainNode -> destination`, plus
   `bus -> MediaStreamAudioDestinationNode`.
2. Patch `AudioNode.prototype.connect`. Any `connect(destination)` on a context
   we created goes to the bus instead.
3. The `MediaStreamAudioDestinationNode`'s track joins the canvas stream.

Results in Chrome: the stream carries a live 48 kHz audio track. On the
A Link to the Past title screen the meter on the **captured** track reads about
-14 to -16 dB. "Hear stream" mutes the direct output and plays the `<video>`
audio, so you can confirm by ear. The host still hears the emulator directly
(the local gain), not the round trip, which matches design doc section 7.

koin.js PR #9 (MIT) uses a similar `connect()` interception. Our version also
wraps the constructor, so we get the context the moment it exists rather than
on the first sample. No code was copied.

## Audio: what didn't, and caveats

- **Autoplay policy.** If the core boots without a user gesture (the `?rom=`
  dev shortcut), the AudioContext starts suspended and the track is silent
  until the first click or key. The real flow is fine because the host picks a
  file. Guests will need a click or button press before `<video>` audio plays,
  and our "Press any button" join step covers that.
- **Tapping is global.** The patched `connect()` affects every AudioContext on
  the page. Analysis contexts must use `tap.NativeAudioContext`, which the spike's
  meter does.
- **Latency.** RetroArch schedules buffers ahead by `audio_latency`, with no
  extra offset on Chrome (`EXTRA_LATENCY_SEC_CHROME: 0`). The tap adds none.
  The local context reports about 50 ms base plus output latency. Lowering
  `audio_latency` is worth testing in milestone 2.

## Video

- `canvas.captureStream(60)` on RetroArch's WebGL canvas just works. No blank
  frames and no `preserveDrawingBuffer` were needed for snes9x.
- **RetroArch sizes its framebuffer from the canvas's CSS box**, not from
  Nostalgist's `size` option. The canvas's CSS size is pinned to 512x448 (2x native).
- With default settings RetroArch letterboxes to 4:3 inside the canvas.
  `aspect_ratio_index: 21` (1:1 PAR) fills 512x448 at exactly 2x with square
  pixels, which suits pixel art and the codec. Guests can stretch to 4:3 in CSS.
- `video_scale_integer` did **not** work for this. It picked 1x and left a
  small picture in the middle.
- The stream track gets `contentHint = "motion"`.

## Design doc changes to propose

1. **"Emulator core in a Worker with OffscreenCanvas" isn't possible with
   Nostalgist.** RetroArch's Emscripten build needs a DOM canvas, drives frames
   with `emscripten_set_main_loop` (requestAnimationFrame), and reads keyboard
   events on the main thread. EmulatorJS has the same constraint. Proposal:
   accept the main thread, keep the play screen's React tree tiny and static
   while running (already the plan), and only consider isolation if we measure
   jank. The fallback idea is a cross-origin iframe, which Chrome runs in its
   own process.
2. **Frame pacing is rAF-driven, not a steady 60 Hz clock.** We can't swap the
   clock without patching the core. On a 120 or 144 Hz monitor, RetroArch's
   audio sync should throttle emulation to the game's rate. **Please test on a
   high-refresh display** and check the fps stat stays near 60, not 120 or 144.
3. Section 7 should say RWebAudio and constructor/connect interception, not OpenAL.

## Housekeeping

- Cores are self-hosted. `scripts/fetch-cores.mjs` downloads the same builds
  Nostalgist uses into `public/cores` (git-ignored) before `dev` and `build`.
  That keeps COEP happy and removes the runtime jsDelivr and zip.js fetch.
- RetroArch requests a Wake Lock. When the page isn't focused, Chrome denies it
  and Next's dev overlay shows "1 issue". It's harmless.

## Not verified here

The in-app browser pane was hidden for most of the run, so Chrome throttled it
to between 1 and 30 fps. **Smooth 60 fps needs checking in a visible Chrome
window.** The video fps stat on `/spike` is the number to watch: it counts
frames the `<video>` actually presented (`requestVideoFrameCallback`).
