"use client";

import { useEffect, useMemo, useState } from "react";
import { MenuNote } from "@/components/play-ui";
import type { SaveSlot } from "@/lib/host/saves-store";
import { useInitialFocus, useNavAction } from "@/lib/nav/react";

/** Slot picker inside the game menu, for saving or loading. */
export function SaveSlots({
  mode,
  list,
  onPick,
  onBack,
}: {
  mode: "save" | "load";
  list: () => Promise<(SaveSlot | null)[]>;
  onPick: (slot: number) => Promise<void>;
  onBack: () => void;
}) {
  const [slots, setSlots] = useState<(SaveSlot | null)[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  useNavAction("back", onBack);
  useInitialFocus(slots !== null);

  useEffect(() => {
    void list().then(setSlots);
  }, [list]);

  const pick = async (slot: number) => {
    if (busy) return;
    setBusy(true);
    try {
      await onPick(slot);
      if (mode === "save") {
        setNote(`Saved to slot ${slot}.`);
        setSlots(await list());
      }
    } catch (e) {
      setNote(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-1">
      <span className="px-4 pb-1 text-[13px] font-bold text-text-muted">
        {mode === "save" ? "Save to a slot" : "Load a slot"}
      </span>
      {slots?.map((save, i) => {
        const slot = i + 1;
        const empty = !save;
        // Focus starts on the first slot you can pick.
        const first = mode === "save" ? 0 : slots.findIndex(Boolean);
        return (
          <button
            key={slot}
            type="button"
            disabled={busy || (mode === "load" && empty)}
            data-nav-default={i === first ? "" : undefined}
            onClick={() => void pick(slot)}
            className="ring-row flex min-h-[68px] items-center gap-3 rounded-xl px-3 text-left focus:bg-surface disabled:opacity-45"
          >
            <Thumb save={save} />
            <span className="flex flex-col">
              <span className="text-base font-bold">Slot {slot}</span>
              <span className="text-xs font-bold text-text-muted">{save ? ago(save.savedAt) : "Empty"}</span>
            </span>
          </button>
        );
      })}
      <button
        type="button"
        onClick={onBack}
        className="ring-row min-h-[52px] rounded-xl px-4 text-left text-base font-bold focus:bg-surface"
      >
        Back
      </button>
      {note && <MenuNote>{note}</MenuNote>}
    </div>
  );
}

export function Thumb({ save, className = "h-[48px] w-[64px] rounded-md" }: { save: SaveSlot | null; className?: string }) {
  const url = useMemo(() => (save?.thumbnail ? URL.createObjectURL(save.thumbnail) : null), [save]);
  useEffect(() => () => void (url && URL.revokeObjectURL(url)), [url]);
  return (
    <span className={`flex-none overflow-hidden bg-game-bg ${className}`}>
      {url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className="h-full w-full object-cover [image-rendering:pixelated]" />
      )}
    </span>
  );
}

export function ago(t: number) {
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 60) return "Just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hr ago`;
  return new Date(t).toLocaleDateString();
}
