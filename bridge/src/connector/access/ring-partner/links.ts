import { createHash, hkdfSync, randomBytes } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { open, seal } from "../../../utilities/security/index.ts";
import { recordingEventId } from "../../engines/normalize/index.ts";
import {
  RecordingWatchError,
  type RecordingCallback,
} from "./camera-callback.ts";

const savedLink = z.object({
  account: z.string().min(1),
  masked: z.string().min(1),
  access: z.string().min(1),
  refresh: z.string().min(1).optional(),
  tokenExpiry: z.number(),
  linkedAt: z.number().int().nonnegative().optional(),
  session: z.string().min(1),
  sessionExpiry: z.number(),
  expires: z.number(),
});
export type SavedLink = z.infer<typeof savedLink>;
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
const CODE_LIFETIME = 10 * 60_000;
const CALLBACK_WAIT_MS = 10 * 60_000;
const recording = z.object({
  eventId: z.string().min(1),
  time: z.number().int().nonnegative(),
  components: z.array(z.string()),
  subType: z.string().optional(),
});
const pairedRecording = recording.extend({
  householdId: z.string(),
  account: z.string(),
  deviceId: z.string(),
  kind: z.enum(["ding", "motion"]),
});

/** Confirmed Ring grants stay encrypted on the home computer. Unclaimed tokens never enter the store. */
export class PilotLinks {
  readonly #db: DatabaseSync;
  readonly #key: Uint8Array;
  constructor(path: string, appId: string, secret: string) {
    this.#key = new Uint8Array(
      hkdfSync("sha256", secret, appId, "ring-pilot/confirmed-links/v1", 32),
    );
    this.#db = new DatabaseSync(path);
    this.#db.exec(
      "PRAGMA busy_timeout=3000; PRAGMA foreign_keys=ON; CREATE TABLE IF NOT EXISTS links (owner TEXT PRIMARY KEY, record BLOB NOT NULL, code TEXT, deadline INTEGER); CREATE TABLE IF NOT EXISTS browsers (session TEXT PRIMARY KEY, owner TEXT NOT NULL REFERENCES links(owner) ON DELETE CASCADE, deadline INTEGER NOT NULL); CREATE TABLE IF NOT EXISTS nonces (nonce TEXT PRIMARY KEY, deadline INTEGER NOT NULL)",
    );
    this.#db.exec(`CREATE TABLE IF NOT EXISTS recording_watches (
      owner TEXT PRIMARY KEY REFERENCES links(owner) ON DELETE CASCADE,
      watch TEXT NOT NULL UNIQUE, device TEXT NOT NULL, kind TEXT NOT NULL,
      start INTEGER NOT NULL, deadline INTEGER NOT NULL, record BLOB)`);
    this.#db.exec(`CREATE TABLE IF NOT EXISTS paired_recordings (
      owner TEXT NOT NULL REFERENCES links(owner) ON DELETE CASCADE,
      event TEXT NOT NULL, deadline INTEGER NOT NULL, record BLOB NOT NULL,
      PRIMARY KEY(owner,event));
      CREATE INDEX IF NOT EXISTS paired_recording_expiry ON paired_recordings(deadline)`);
  }
  /** Keep the exact provider reference under the same encrypted account grant as its tokens. */
  savePairedRecording(
    eventId: string,
    householdId: string,
    event: RecordingCallback,
  ) {
    const owner = hash(event.account);
    const bytes = Buffer.from(JSON.stringify({ householdId, ...event }));
    const stored = this.#db
      .prepare("SELECT record FROM paired_recordings WHERE owner=? AND event=?")
      .get(owner, eventId);
    if (stored) {
      if (
        !(stored.record instanceof Uint8Array) ||
        !bytes.equals(open(this.#key, stored.record, "secrets-file"))
      )
        throw new Error("Conflicting recording reference.");
      return;
    }
    this.#db
      .prepare("INSERT INTO paired_recordings VALUES(?,?,?,?)")
      .run(
        owner,
        eventId,
        event.time + 30 * 86_400_000,
        seal(this.#key, bytes, "secrets-file"),
      );
  }
  recordingById(account: string, eventId: string, now: number) {
    const row = this.#db
      .prepare(
        "SELECT record FROM paired_recordings WHERE owner=? AND event=? AND deadline>?",
      )
      .get(hash(account), eventId, now);
    if (!(row?.record instanceof Uint8Array)) return undefined;
    const value = pairedRecording.parse(
      JSON.parse(
        Buffer.from(open(this.#key, row.record, "secrets-file")).toString(
          "utf8",
        ),
      ),
    );
    return value.account === account && recordingEventId(value) === eventId
      ? value
      : undefined;
  }
  /** One local watch per linked account. Removing or replacing the link clears its watch. */
  watchRecording(
    account: string,
    device: string,
    kind: "motion" | "ding",
    now: number,
  ) {
    const watch = randomBytes(16).toString("hex");
    this.expireWatches(now);
    const result = this.#db
      .prepare(
        "INSERT INTO recording_watches(owner,watch,device,kind,start,deadline) VALUES(?,?,?,?,?,?) ON CONFLICT(owner) DO NOTHING",
      )
      .run(
        hash(account),
        watch,
        hash(device),
        kind,
        now,
        now + CALLBACK_WAIT_MS,
      );
    if (!result.changes)
      throw new RecordingWatchError(
        "This account already has an active recording watch.",
      );
    return watch;
  }
  receiveRecording(event: RecordingCallback, now: number) {
    if (event.time > now) return;
    const { eventId, time, components, subType } = event;
    const encrypted = seal(
      this.#key,
      Buffer.from(JSON.stringify({ eventId, time, components, subType })),
      "secrets-file",
    );
    this.#db
      .prepare(
        `UPDATE recording_watches SET record=? WHERE owner=? AND device=? AND kind=?
      AND start<=? AND deadline>? AND record IS NULL`,
      )
      .run(
        encrypted,
        hash(event.account),
        hash(event.deviceId),
        event.kind,
        time,
        now,
      );
  }
  watchedRecording(watch: string, now: number) {
    const row = this.#db
      .prepare(
        "SELECT record FROM recording_watches WHERE watch=? AND deadline>?",
      )
      .get(watch, now);
    if (!row)
      throw new RecordingWatchError(
        "The recording watch expired or the account link changed.",
      );
    if (!(row.record instanceof Uint8Array)) return undefined;
    return recording.parse(
      JSON.parse(
        Buffer.from(open(this.#key, row.record, "secrets-file")).toString(
          "utf8",
        ),
      ),
    );
  }
  finishWatch(watch: string) {
    this.#db.prepare("DELETE FROM recording_watches WHERE watch=?").run(watch);
  }
  expireWatches(now: number) {
    this.#db
      .prepare("DELETE FROM paired_recordings WHERE deadline<=?")
      .run(now);
    this.#db
      .prepare("DELETE FROM recording_watches WHERE deadline<=?")
      .run(now);
  }
  load(): SavedLink[] {
    return this.#db
      .prepare("SELECT owner,record FROM links")
      .all()
      .map((row) => {
        if (!(row.record instanceof Uint8Array))
          throw new Error("Unreadable pilot link");
        const plain = open(this.#key, row.record, "secrets-file");
        const result = savedLink.parse(
          JSON.parse(Buffer.from(plain).toString("utf8")),
        );
        if (hash(result.account) !== row.owner)
          throw new Error("Invalid pilot link record");
        return result;
      });
  }
  usedNonce(nonce: string, now: number) {
    return Boolean(
      this.#db
        .prepare("SELECT 1 FROM nonces WHERE nonce=? AND deadline>?")
        .get(hash(nonce), now),
    );
  }
  confirm(value: SavedLink, nonce: string, deadline: number, now: number) {
    this.#db.exec("BEGIN IMMEDIATE");
    try {
      this.#db.prepare("DELETE FROM nonces WHERE deadline<=?").run(now);
      this.#db
        .prepare("INSERT INTO nonces VALUES(?,?)")
        .run(hash(nonce), deadline);
      this.remove(value.account);
      this.save(value);
      this.#db.exec("COMMIT");
    } catch (error) {
      this.#db.exec("ROLLBACK");
      throw error;
    }
  }
  save(value: SavedLink) {
    const plain = Buffer.from(JSON.stringify(savedLink.parse(value)));
    this.#db
      .prepare(
        "INSERT INTO links(owner,record) VALUES(?,?) ON CONFLICT(owner) DO UPDATE SET record=excluded.record",
      )
      .run(hash(value.account), seal(this.#key, plain, "secrets-file"));
  }
  remove(account: string) {
    this.#db.prepare("DELETE FROM links WHERE owner=?").run(hash(account));
  }
  browserCode(now: number, hint?: string) {
    const available = this.load().filter((link) => link.expires > now);
    const matches = available.filter(
      (link) => !hint || link.masked === hint || link.account === hint,
    );
    const [link] = matches;
    if (!available.length)
      throw new Error(
        "No saved Ring authorization. Complete one fresh Ring link to initialize this pilot.",
      );
    if (matches.length !== 1 || !link)
      throw new Error(
        "Select one linked account using -AccountHint: " +
          available.map((item) => item.masked).join(", "),
      );
    const code = randomBytes(16).toString("hex");
    this.#db
      .prepare("UPDATE links SET code=?,deadline=? WHERE owner=?")
      .run(hash(code), now + CODE_LIFETIME, hash(link.account));
    return code;
  }
  browserOwner(session: string, now: number) {
    return this.#db
      .prepare("SELECT owner FROM browsers WHERE session=? AND deadline>?")
      .get(session, now)?.owner;
  }
  redeem(code: string, now: number, session: string, deadline: number) {
    if (!/^[0-9a-f]{32}$/.test(code)) return false;
    this.#db.exec("BEGIN IMMEDIATE");
    try {
      this.#db.prepare("DELETE FROM browsers WHERE deadline<=?").run(now);
      const row = this.#db
        .prepare(
          "UPDATE links SET code=NULL,deadline=NULL WHERE code=? AND deadline>? RETURNING owner",
        )
        .get(hash(code), now);
      if (typeof row?.owner === "string")
        this.#db
          .prepare("INSERT INTO browsers VALUES(?,?,?)")
          .run(session, row.owner, deadline);
      this.#db.exec("COMMIT");
      return Boolean(row);
    } catch (error) {
      this.#db.exec("ROLLBACK");
      throw error;
    }
  }
  close() {
    this.#db.close();
  }
}
