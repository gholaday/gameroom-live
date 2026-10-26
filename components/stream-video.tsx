"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";

/**
 * Plays a remote MediaStream as soon as frames decode. Starts unmuted when the
 * browser allows it; otherwise falls back to muted and offers a sound button
 * (gamepad presses don't count as a user gesture for autoplay).
 */
export const StreamVideo = forwardRef<
  HTMLVideoElement,
  { stream: MediaStream | null; muted?: boolean; className?: string }
>(function StreamVideo({ stream, muted = false, className = "" }, ref) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [needsSound, setNeedsSound] = useState(false);
  useImperativeHandle(ref, () => videoRef.current!);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !stream) return;
    video.srcObject = stream;
    video.muted = muted;
    video.play().catch(() => {
      if (muted) return;
      video.muted = true;
      setNeedsSound(true);
      void video.play().catch(() => {});
    });
  }, [stream, muted]);

  const enableSound = () => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = false;
    void video.play();
    setNeedsSound(false);
  };

  return (
    <>
      <video ref={videoRef} playsInline autoPlay className={`[image-rendering:pixelated] ${className}`} />
      {needsSound && (
        <button
          type="button"
          onClick={enableSound}
          data-nav="skip"
          className="absolute right-6 bottom-5 z-10 rounded-full bg-white/92 px-3.5 py-[7px] text-[13px] font-extrabold text-text"
        >
          Click for sound
        </button>
      )}
    </>
  );
});
