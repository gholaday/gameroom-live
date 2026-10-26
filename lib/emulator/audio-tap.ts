// Captures the emulator's audio as a MediaStream.
//
// RetroArch's Emscripten build (RWebAudio driver) creates its own AudioContext
// and, for every audio chunk, a fresh AudioBufferSourceNode connected straight
// to context.destination. There is no long-lived node to tap, and the context
// lives in a closure we can't reach. So, before the core boots:
//
// 1. Wrap window.AudioContext so we see the core's context as it's created.
// 2. Patch AudioNode.prototype.connect so anything connecting to that
//    context's destination connects to our bus GainNode instead.
// 3. The bus feeds both the speakers (the host hears it directly) and a
//    MediaStreamAudioDestinationNode, whose track goes to guests.

export type AudioTap = {
  /** Resolves with the audio stream once the core creates its AudioContext. */
  stream: Promise<MediaStream>;
  /** Volume for the host's own speakers. Does not affect the stream. */
  setLocalVolume: (v: number) => void;
  /** The unpatched AudioContext, for analysis nodes that must not be tapped. */
  NativeAudioContext: typeof AudioContext;
  /** Restores the original AudioContext and connect(). */
  uninstall: () => void;
};

type Bus = { bus: GainNode; local: GainNode; out: MediaStreamAudioDestinationNode };

export function installAudioTap(): AudioTap {
  const OrigContext = window.AudioContext;
  const origConnect = AudioNode.prototype.connect;
  const connectNode = origConnect as (this: AudioNode, dest: AudioNode) => AudioNode;
  const buses = new WeakMap<BaseAudioContext, Bus>();
  let localVolume = 1;
  let current: Bus | null = null;
  let resolveStream!: (s: MediaStream) => void;
  const stream = new Promise<MediaStream>((r) => (resolveStream = r));

  class TappedAudioContext extends OrigContext {
    constructor(options?: AudioContextOptions) {
      // Ask for the lowest output latency the platform gives us.
      super({ latencyHint: "interactive", ...options });
      const bus = this.createGain();
      const local = this.createGain();
      local.gain.value = localVolume;
      const out = this.createMediaStreamDestination();
      connectNode.call(bus, local);
      connectNode.call(local, this.destination);
      connectNode.call(bus, out);
      current = { bus, local, out };
      buses.set(this, current);
      resolveStream(out.stream);
    }
  }

  // connect() is overloaded (AudioNode or AudioParam), so patch it loosely.
  function tappedConnect(this: AudioNode, ...args: unknown[]): unknown {
    const [target] = args;
    if (target instanceof AudioDestinationNode) {
      const entry = buses.get(target.context);
      if (entry && this !== entry.local) {
        return (origConnect as (...a: unknown[]) => unknown).call(this, entry.bus, ...args.slice(1));
      }
    }
    return (origConnect as (...a: unknown[]) => unknown).apply(this, args);
  }

  window.AudioContext = TappedAudioContext;
  AudioNode.prototype.connect = tappedConnect as typeof AudioNode.prototype.connect;

  return {
    stream,
    NativeAudioContext: OrigContext,
    setLocalVolume(v) {
      localVolume = v;
      if (current) current.local.gain.value = v;
    },
    uninstall() {
      window.AudioContext = OrigContext;
      AudioNode.prototype.connect = origConnect;
    },
  };
}
