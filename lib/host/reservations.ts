/**
 * Holds a dropped player's slot so a reconnect (same guest token) gets it back.
 * Pure, with time passed in, so it's easy to test.
 */
export class SlotReservations {
  private readonly held = new Map<string, { slot: number; until: number }>();
  private readonly banned = new Set<string>();

  constructor(private readonly holdMs: number) {}

  hold(token: string, slot: number, now: number) {
    if (slot > 0 && !this.banned.has(token)) this.held.set(token, { slot, until: now + this.holdMs });
  }

  /** Slot to restore for this token, if still held and not taken since. Consumes it. */
  claim(token: string, now: number, taken: ReadonlySet<number>): number {
    const r = this.held.get(token);
    this.held.delete(token);
    if (!r || r.until < now || taken.has(r.slot)) return 0;
    return r.slot;
  }

  /** Slots held for someone else count as taken for new claims. */
  heldSlots(now: number): Set<number> {
    const slots = new Set<number>();
    for (const [token, r] of this.held) {
      if (r.until < now) this.held.delete(token);
      else slots.add(r.slot);
    }
    return slots;
  }

  ban(token: string) {
    this.banned.add(token);
    this.held.delete(token);
  }

  isBanned(token: string) {
    return this.banned.has(token);
  }
}
