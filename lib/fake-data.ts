// Static fake data for milestone 0. Replaced by real room state later.

export type PlayerSlot = 1 | 2 | 3 | 4;

export type Player = {
  slot: PlayerSlot;
  name: string;
  isHost?: boolean;
  /** Round trip time to the host in ms. Undefined for the host itself. */
  rttMs?: number;
};

export type Game = {
  id: string;
  title: string;
  system: string;
};

export const ROOM_CODE = "K7QX";
export const HOST_NAME = "Garrett";

export const PLAYERS: Player[] = [
  { slot: 1, name: "Garrett", isHost: true },
  { slot: 2, name: "Sam", rttMs: 28 },
];

export const MENU_PLAYERS: Player[] = [...PLAYERS, { slot: 3, name: "Jo", rttMs: 52 }];

export const GAMES: Game[] = [
  { id: "mk64", title: "Mario Kart 64", system: "Nintendo 64" },
  { id: "sbm2", title: "Super Bomberman 2", system: "Super Nintendo" },
  { id: "ctr", title: "Crash Team Racing", system: "PlayStation" },
];
