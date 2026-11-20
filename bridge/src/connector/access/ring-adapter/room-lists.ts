// Ring's room lists, read tolerantly (T033, DRIFT-001-80; CD4, the anti-corruption rule). Each hub
// keeps a list of the home's rooms, which ring-client-api fetches over the live connection when
// asked (`getRoomList`) and does not type; each alarm device names its room by id (`roomId`). No
// recorded payload shows the list's shape, so the reader takes only what it can be sure of:
// - an entry is a room only with an id (a number, or a string that is not empty) and a name that is
//   not empty. Anything else is skipped, and `listed` against `rooms.size` shows how many;
// - an answer that is not a list is unreadable: no rooms come from it.
// Room names are Ring's text: untrusted, kept exactly as written, and never logged (FR-033, OR6).
import { z } from "zod";

const ROOM_ENTRY = z.object({
  id: z.union([z.number(), z.string().min(1)]),
  name: z.string().min(1),
});

/** A hub's room list as read. */
export interface RoomList {
  /** False when Ring's answer was not a list at all. */
  readonly readable: boolean;
  /** How many entries Ring's list held, readable or not. */
  readonly listed: number;
  /** The rooms read, by id as a string. */
  readonly rooms: ReadonlyMap<string, string>;
}

/** Ring's answer to a room-list request, read tolerantly. */
export function readRoomList(answer: unknown): RoomList {
  if (!Array.isArray(answer)) {
    return { readable: false, listed: 0, rooms: new Map() };
  }
  const rooms = new Map<string, string>();
  for (const entry of answer as readonly unknown[]) {
    const room = ROOM_ENTRY.safeParse(entry);
    if (room.success) {
      rooms.set(String(room.data.id), room.data.name);
    }
  }
  return { readable: true, listed: answer.length, rooms };
}
