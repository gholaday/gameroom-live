"use client";

import { useState } from "react";
import { Avatar, latencyClass, type PlayerSlot } from "@/components/ui";
import type { GuestInfo } from "@/lib/host/session";
import { REMOTE_PLAYERS } from "@/lib/emulator/injector";
import { MAX_NAME } from "@/lib/identity";

/** Host controls: move guests between slots, make them spectate, or remove them. */
export function PlayersPanel({
  hostName,
  guests,
  onSlot,
  onKick,
}: {
  hostName: string;
  guests: GuestInfo[];
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
          {REMOTE_PLAYERS.map((slot) => (
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
    </section>
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
