"use client";

import { useEffect, useRef, useState } from "react";
import type { Nostalgist } from "nostalgist";
import { Dot, Footer, Hint } from "@/components/ui";
import { installAudioTap, type AudioTap } from "@/lib/emulator/audio-tap";
import { coreForFile, selfHostedCores } from "@/lib/emulator/cores";
import { useGameMode } from "@/lib/nav/react";

// SNES native is 256x224; stream at an integer 2x.
const STREAM_SIZE = { width: 512, height: 448 };

type Phase = "idle" | "booting" | "running" | "error";

/**
 * Milestone 1 spike: run a SNES ROM with Nostalgist, capture the canvas and
 * the emulator audio into one MediaStream, and play it in a <video> beside it.
 * Stats are written straight to the DOM so the frame loop never re-renders React.
 */
export function SpikeScreen() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const statsRef = useRef<HTMLDListElement>(null);
  const meterRef = useRef<HTMLSpanElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const emuRef = useRef<Nostalgist | null>(null);
  const tapRef = useRef<AudioTap | null>(null);
  const stopLoopsRef = useRef<() => void>(() => {});
  const bootingRef = useRef(false);
  const devLoadedRef = useRef(false);

  const [phase, setPhase] = useState<Phase>("idle");
  const [message, setMessage] = useState("Pick a .sfc or .smc file to boot it.");
  const [listening, setListening] = useState(false);

  // While the game runs, keys and pads belong to the emulator.
  useGameMode(phase === "running");

  useEffect(() => {
    return () => {
      stopLoopsRef.current();
      emuRef.current?.exit({ removeCanvas: false });
      tapRef.current?.uninstall();
    };
  }, []);

  const boot = async (file: File) => {
    const core = coreForFile(file.name);
    if (!core) {
      setPhase("error");
      setMessage(`No core for ${file.name}. The spike only runs SNES (.sfc, .smc).`);
      return;
    }
    // One boot at a time: the audio tap wraps the global AudioContext.
    if (bootingRef.current) return;
    bootingRef.current = true;
    const canvas = canvasRef.current!;
    const video = videoRef.current!;

    stopLoopsRef.current();
    emuRef.current?.exit({ removeCanvas: false });
    tapRef.current?.uninstall();

    setPhase("booting");
    setMessage(`Booting ${file.name}`);
    const tap = installAudioTap();
    tapRef.current = tap;

    try {
      const { Nostalgist } = await import("nostalgist");
      emuRef.current = await Nostalgist.launch({
        core,
        rom: file,
        element: canvas,
        size: STREAM_SIZE,
        ...selfHostedCores,
        // aspect_ratio_index 21 is "1:1 PAR" (square pixels), so 256x224 fills
        // 512x448 at exactly 2x with no letterbox. Guests can restore 4:3 in CSS.
        retroarchConfig: { video_smooth: false, aspect_ratio_index: 21 },
      });
    } catch (err) {
      setPhase("error");
      setMessage(`Boot failed: ${err instanceof Error ? err.message : String(err)}`);
      return;
    } finally {
      bootingRef.current = false;
    }

    // One stream with both tracks, the same shape we'll hand to WebRTC.
    const stream = canvas.captureStream(60);
    const [videoTrack] = stream.getVideoTracks();
    if (videoTrack) videoTrack.contentHint = "motion";
    video.srcObject = stream;
    video.play().catch(() => {});

    setPhase("running");
    setMessage(`Running ${file.name}`);

    const stopVideoStats = watchVideo(video, statsRef.current!);
    let stopMeter = () => {};
    // The audio track appears once the core creates its AudioContext.
    tap.stream.then((audio) => {
      for (const track of audio.getAudioTracks()) stream.addTrack(track);
      stopMeter = watchAudio(stream, tap.NativeAudioContext, meterRef.current!, statsRef.current!);
    });
    stopLoopsRef.current = () => {
      stopVideoStats();
      stopMeter();
    };
  };

  // Dev shortcut: /spike?rom=<file in /roms> boots without the file picker.
  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    const name = new URLSearchParams(window.location.search).get("rom");
    if (!name || devLoadedRef.current) return;
    devLoadedRef.current = true;
    fetch(`/dev/roms/${encodeURIComponent(name)}`)
      .then((r) => (r.ok ? r.blob() : Promise.reject(new Error(`${r.status}`))))
      .then((blob) => boot(new File([blob], name)))
      .catch(() => setMessage(`Could not load ${name} from /roms.`));
  }, []);

  const toggleListen = () => {
    const next = !listening;
    setListening(next);
    // Hear the stream instead of the emulator, to confirm the audio is in it.
    if (videoRef.current) videoRef.current.muted = !next;
    tapRef.current?.setLocalVolume(next ? 0 : 1);
  };

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex flex-wrap items-center justify-between gap-4 px-10 py-[22px] max-sm:px-4">
        <div className="flex flex-col">
          <span className="text-sm font-bold text-text-muted">Milestone 1</span>
          <h1 className="text-[26px] font-extrabold text-primary-text">Local capture spike</h1>
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            data-nav-default=""
            onClick={() => fileRef.current?.click()}
            className="ring-row min-h-12 rounded-full bg-primary-text px-[22px] text-sm font-extrabold text-white"
          >
            Open SNES ROM
          </button>
          <button
            type="button"
            onClick={toggleListen}
            disabled={phase !== "running"}
            className="ring-row min-h-12 rounded-full bg-surface px-[22px] text-sm font-extrabold text-text shadow-soft disabled:opacity-50"
          >
            {listening ? "Hear emulator" : "Hear stream"}
          </button>
          <input
            ref={fileRef}
            type="file"
            hidden
            accept=".sfc,.smc"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) boot(file);
            }}
          />
        </div>
      </header>

      <main className="grid flex-1 gap-6 px-10 pb-6 max-sm:px-4 lg:grid-cols-2">
        <Panel title="Emulator canvas" note="What the host renders">
          {/* RetroArch sizes its framebuffer from the canvas's CSS box, so the
              box is pinned to the stream size rather than the layout. */}
          <div className="overflow-auto">
            <canvas
              ref={canvasRef}
              width={STREAM_SIZE.width}
              height={STREAM_SIZE.height}
              style={STREAM_SIZE}
              className="mx-auto block rounded-lg bg-game-bg"
            />
          </div>
        </Panel>
        <Panel title="Captured stream" note="canvas.captureStream(60) plus tapped audio">
          <video
            ref={videoRef}
            muted
            playsInline
            className="aspect-[8/7] w-full rounded-lg bg-game-bg [image-rendering:pixelated]"
          />
        </Panel>

        <section className="rounded-card bg-surface p-5 shadow-soft lg:col-span-2" aria-label="Stats">
          <div className="mb-3 flex items-center gap-3">
            <span className="w-24 text-sm font-bold text-text-muted">Stream audio</span>
            <span className="h-3 flex-1 overflow-hidden rounded-full bg-bg">
              <span ref={meterRef} className="block h-full w-0 rounded-full bg-ok" />
            </span>
          </div>
          <dl
            ref={statsRef}
            className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4 [&_dd]:font-extrabold [&_dt]:font-bold [&_dt]:text-text-muted"
          >
            <Stat k="fps" label="Video fps" />
            <Stat k="dropped" label="Dropped frames" />
            <Stat k="size" label="Video size" />
            <Stat k="audio" label="Audio track" />
            <Stat k="rate" label="Sample rate" />
            <Stat k="latency" label="Output latency" />
            <Stat k="level" label="Peak level" />
          </dl>
        </section>
      </main>

      <Footer
        status={
          <span role="status" className="inline-flex items-center gap-2">
            <Dot
              className={
                phase === "running" ? "bg-ok" : phase === "error" ? "bg-danger" : "bg-slot-empty"
              }
            />
            {message}
          </span>
        }
        hints={
          <>
            <Hint button="Z">B</Hint>
            <Hint button="X">A</Hint>
            <Hint button="A">Y</Hint>
            <Hint button="S">X</Hint>
          </>
        }
      />
    </div>
  );
}

function Panel({ title, note, children }: { title: string; note: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3 rounded-card bg-surface p-4 shadow-soft">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-extrabold">{title}</h2>
        <span className="text-[13px] font-semibold text-text-muted">{note}</span>
      </div>
      {children}
    </section>
  );
}

function Stat({ k, label }: { k: string; label: string }) {
  return (
    <div className="flex flex-col">
      <dt>{label}</dt>
      <dd data-stat={k}>Not yet</dd>
    </div>
  );
}

function setStat(root: HTMLElement, key: string, value: string) {
  const el = root.querySelector<HTMLElement>(`[data-stat="${key}"]`);
  if (el && el.textContent !== value) el.textContent = value;
}

/** Counts frames actually presented by the <video>, once a second. */
function watchVideo(video: HTMLVideoElement, stats: HTMLElement) {
  let frames = 0;
  let windowStart = performance.now();
  let handle = 0;
  let stopped = false;
  const onFrame = (now: number) => {
    if (stopped) return;
    frames++;
    if (now - windowStart >= 1000) {
      const fps = (frames * 1000) / (now - windowStart);
      const q = video.getVideoPlaybackQuality();
      setStat(stats, "fps", fps.toFixed(1));
      setStat(stats, "dropped", `${q.droppedVideoFrames} of ${q.totalVideoFrames}`);
      setStat(stats, "size", `${video.videoWidth}x${video.videoHeight}`);
      frames = 0;
      windowStart = now;
    }
    handle = video.requestVideoFrameCallback(onFrame);
  };
  handle = video.requestVideoFrameCallback(onFrame);
  return () => {
    stopped = true;
    video.cancelVideoFrameCallback(handle);
  };
}

/** Meters the audio track inside the captured stream, not the emulator output. */
function watchAudio(
  stream: MediaStream,
  NativeAudioContext: typeof AudioContext,
  meter: HTMLElement,
  stats: HTMLElement,
) {
  const [track] = stream.getAudioTracks();
  if (!track) {
    setStat(stats, "audio", "Missing");
    return () => {};
  }
  const ctx = new NativeAudioContext();
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 1024;
  ctx.createMediaStreamSource(new MediaStream([track])).connect(analyser);
  const buf = new Float32Array(analyser.fftSize);
  let peakHold = 0;
  let lastText = 0;
  let raf = 0;

  const tick = (now: number) => {
    analyser.getFloatTimeDomainData(buf);
    let peak = 0;
    for (const s of buf) peak = Math.max(peak, Math.abs(s));
    peakHold = Math.max(peak, peakHold * 0.95);
    meter.style.width = `${Math.min(100, peakHold * 100)}%`;
    if (now - lastText > 500) {
      lastText = now;
      const settings = track.getSettings();
      setStat(stats, "audio", `${track.readyState}${track.muted ? ", muted" : ""}`);
      setStat(stats, "rate", `${settings.sampleRate ?? ctx.sampleRate} Hz`);
      setStat(stats, "latency", `${Math.round((ctx.baseLatency + (ctx.outputLatency || 0)) * 1000)} ms`);
      setStat(stats, "level", peakHold > 0.001 ? `${(20 * Math.log10(peakHold)).toFixed(1)} dB` : "Silent");
    }
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  return () => {
    cancelAnimationFrame(raf);
    ctx.close();
  };
}
