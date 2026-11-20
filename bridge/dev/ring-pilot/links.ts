import { createHash, hkdfSync, randomBytes } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { open, seal } from "../../src/utilities/security/sealing.ts";

const savedLink = z.object({
  account: z.string().min(1),
  masked: z.string().min(1),
  access: z.string().min(1),
  refresh: z.string().min(1).optional(),
  tokenExpiry: z.number(),
  session: z.string().min(1),
  sessionExpiry: z.number(),
  expires: z.number(),
});
export type SavedLink = z.infer<typeof savedLink>;
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
const CODE_LIFETIME = 10 * 60_000;

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
