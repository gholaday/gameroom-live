"use client";

import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { Avatar, latencyClass, type PlayerSlot } from "@/components/ui";
import type { GuestInfo } from "@/lib/host/session";
import { MAX_NAME } from "@/lib/identity";
import { enableLanAccess, watchLanAccess, type LanAccess } from "@/lib/net/lan-access";

/** Host controls: move guests between slots, make them spectate, or remove them. */
export function PlayersPanel({
  hostName,
  guests,
  slots,
  onSlot,
  onKick,
}: {
  hostName: string;
  guests: GuestInfo[];
  /** Slots guests can take for this game. */
  slots: number[];
  onSlot: (id: string, slot: number) => void;
  onKick: (id: string) => void;
}) {
  return (
    <section aria-label="Players" className="flex flex-col gap-3 rounded-card bg-surface p-4 shadow-[0_2px_6px_rgba(0,0,0,0.06)]">
      <h2 className="text-base font-extrabold">Players</h2>
      <Row slot={1} name={hostName} detail="Player 1, you" />
      {guests.length === 0 && <p className="text-sm font-bold text-text-muted">No one has joined yet.</p>}
      {guests.map((g) => (
        <Row
          key={g.id}
          slot={g.slot ? (g.slot as PlayerSlot) : null}
          name={g.name}
          detail={
            <>
              {g.slot ? `Player ${g.slot}` : "Watching"}
              {g.rttMs > 0 && <span className={`ml-2 ${latencyClass(g.rttMs)}`}>{g.rttMs} ms</span>}
            </>
          }
        >
          {slots.map((slot) => (
            <SmallButton key={slot} active={g.slot === slot} onClick={() => onSlot(g.id, slot)}>
              {`P${slot}`}
            </SmallButton>
          ))}
          <SmallButton active={!g.slot} onClick={() => onSlot(g.id, 0)}>
            Watch
          </SmallButton>
          <SmallButton danger onClick={() => onKick(g.id)}>
            Remove
          </SmallButton>
        </Row>
      ))}
    </section>
  );
}

/** Host display name, shown to guests in the lobby and on the overlay. */
export function SettingsPanel({ name, onName }: { name: string; onName: (name: string) => void }) {
  const [value, setValue] = useState(name);
  return (
    <section aria-label="Settings" className="flex flex-col gap-3 rounded-card bg-surface p-4 shadow-[0_2px_6px_rgba(0,0,0,0.06)]">
      <h2 className="text-base font-extrabold">Settings</h2>
      <NameField value={value} onChange={setValue} onCommit={() => onName(value)} label="Your name" />
      <WifiJoin />
    </section>
  );
}

/** Lets phones and laptops on the host's own Wi-Fi connect (see lib/net/lan-access.ts). */
function WifiJoin() {
  const [access, setAccess] = useState<LanAccess | null>(null);
  const [asking, setAsking] = useState(false);
  useEffect(() => watchLanAccess(setAccess), []);
  if (!access || access === "unsupported") return null;

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line-soft pt-3">
      <div className="flex min-w-[200px] flex-1 flex-col gap-0.5">
        <span className="text-sm font-extrabold">Players on your Wi-Fi</span>
        <span className="text-xs leading-snug font-semibold text-text-muted">
          {access === "on"
            ? "Devices on this network can join. New connections use this computer's local address."
            : access === "blocked"
              ? "The microphone is blocked for this site, so devices on your Wi-Fi may not connect. Allow it in the browser's site settings."
              : "Your browser hides this computer's local address, so phones on the same Wi-Fi may not connect. Allowing the microphone once lifts that. Nothing is recorded."}
        </span>
      </div>
      {access === "on" ? (
        <span className="inline-flex items-center gap-1.5 text-sm font-extrabold text-ok">
          <Check size={16} strokeWidth={3} aria-hidden />
          On
        </span>
      ) : (
        access === "off" && (
          <button
            type="button"
            disabled={asking}
            onClick={async () => {
              setAsking(true);
              if (!(await enableLanAccess())) setAsking(false);
            }}
            className="ring-row min-h-10 rounded-full bg-primary-text px-4 text-sm font-extrabold text-white disabled:opacity-60"
          >
            Allow
          </button>
        )
      )}
    </div>
  );
}

export function NameField({
  value,
  onChange,
  onCommit,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  onCommit: () => void;
  label: string;
}) {
  return (
    <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-text-muted">
      {label}
      <input
        value={value}
        maxLength={MAX_NAME}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onCommit}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
        }}
        className="ring-row min-h-11 rounded-full border-none bg-bg px-3.5 text-sm font-bold text-text"
      />
    </label>
  );
}

function Row({
  slot,
  name,
  detail,
  children,
}: {
  slot: PlayerSlot | null;
  name: string;
  detail: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      {slot ? (
        <Avatar slot={slot} name={name} size={40} />
      ) : (
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-bg text-sm font-extrabold text-text-muted">
          {name.slice(0, 1).toUpperCase()}
        </span>
      )}
      <div className="flex min-w-[120px] flex-1 flex-col">
        <span className="truncate text-sm font-extrabold">{name}</span>
        <span className="text-xs font-bold text-text-muted">{detail}</span>
      </div>
      {children && <div className="flex flex-wrap gap-1.5">{children}</div>}
    </div>
  );
}

function SmallButton({
  children,
  onClick,
  active,
  danger,
}: {
  children: string;
  onClick: () => void;
  active?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`ring-row min-h-9 rounded-full px-3 text-xs font-extrabold ${
        active ? "bg-primary-text text-white" : danger ? "bg-bg text-danger" : "bg-bg text-text"
      }`}
    >
      {children}
    </button>
  );
}
