# Milestone 3 notes

## Reconnect and slots

- Each guest tab sends a token (`sessionStorage`, per room) in `hello`. A
  dropped player's slot is held for 60 s (`SlotReservations`), and the same
  token gets it back.
- A reloaded guest tab often says hello before the host has noticed the old
  connection is gone. The host treats a hello whose token matches a live
  connection as a takeover: it moves the slot over and closes the old one.
- Restoring checks only connected players' slots. Checking held slots too would
  count the guest's own reservation as taken.
- A kick sends `kicked` and bans the token for the rest of the session, so a
  reload doesn't get back in.

## Host grace and resume

- The room code is kept in `sessionStorage`. After a refresh the host reopens
  the same code, retrying for a few seconds while the broker frees the old id.
- Guests that lose the host go to "Waiting for the host to come back" and retry
  every 2 s for 30 s. An attempt can hang without opening, closing or failing,
  so each attempt has an 8 s deadline. After the host reloads (which forgets
  slots), a guest that had a slot asks for one again.
- Resume lives in IndexedDB (`gameroom` db, `resume` store). The ROM and the
  save state are separate keys, so the autosave (once a minute) rewrites only the state
  (a few hundred KB), never the multi-MB ROM. It also saves when the tab is
  hidden. Ending the session on purpose clears it.
- A refresh straight into `/play` shows a Continue button before booting,
  because without a user gesture the core's AudioContext starts suspended.
- Nostalgist asks for a screen wake lock. The browser can deny it, which shows
  up as a harmless console error.

## ROM library

- Chrome and Edge: `showDirectoryPicker`. The folder handle is saved in
  IndexedDB and scanned recursively. ROMs are read from disk when picked. After
  a browser restart the browser may want a click before reading the folder
  again: the Reconnect tile, or just picking a game, asks.
- Other browsers: `<input webkitdirectory>`. ROMs are copied into IndexedDB
  (SNES ROMs are at most a few MB each).
- Opening a single ROM file also adds it to the library.

## Latency estimate

Guest pill shows about `RTT + 1 frame + host encode + jitter buffer + decode`.
The host sends its per-frame encode time to each guest once a second. Buffer
and decode come from the guest's `inbound-rtp` deltas. Tap the pill for the
breakdown.

## Touch controls

One pointer handler covers the whole pad, so several fingers and sliding
between buttons both work. The D-pad is 8-way by angle with a center deadzone.
State is sent on every change, like the keyboard. In touch mode the drawing
overlay doesn't take input, but others' hands and ink still show. In portrait,
Select and Start move up between L and R.

## Known limits

- Only player 2 has input bindings, so the Players panel offers P2 or Watch.
  Players 3 and 4 need more RetroArch bindings and a multitap setting.
- The host tab must stay visible: hidden tabs stop producing frames.
