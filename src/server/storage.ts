import Database from "better-sqlite3";
import { migrations } from "./migrations.js";

export type Db = Database.Database;

export interface DonationRecord {
  id: string;
  tokenId: string;
  amount: bigint;
  address: string;
  message: string;
  nickname: string | null;
  createdAt: number;
  expiresAt: number;
  heldUntil: number;
}

export function openDatabase(path: string): Db {
  const db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  migrate(db);
  return db;
}

function migrate(db: Db): void {
  const current = db.pragma("user_version", { simple: true }) as number;
  migrations.slice(current).forEach((sql, index) => {
    db.transaction(() => {
      db.exec(sql);
      db.pragma(`user_version = ${String(current + index + 1)}`);
    })();
  });
}

export function releaseExpiredHolds(db: Db, tokenId: string, now: number): void {
  db.prepare("DELETE FROM held_amounts WHERE token_id = ? AND held_until <= ?").run(tokenId, now);
}

export function heldAmounts(db: Db, tokenId: string): Set<bigint> {
  const rows = db
    .prepare("SELECT amount FROM held_amounts WHERE token_id = ?")
    .pluck()
    .all(tokenId) as string[];
  return new Set(rows.map((amount) => BigInt(amount)));
}

export function insertDonation(db: Db, donation: DonationRecord): void {
  db.prepare(
    `INSERT INTO donations (id, token_id, amount, address, message, nickname, created_at, expires_at)
     VALUES (@id, @tokenId, @amount, @address, @message, @nickname, @createdAt, @expiresAt)`,
  ).run({
    id: donation.id,
    tokenId: donation.tokenId,
    amount: donation.amount.toString(),
    address: donation.address,
    message: donation.message,
    nickname: donation.nickname,
    createdAt: donation.createdAt,
    expiresAt: donation.expiresAt,
  });
  db.prepare(
    `INSERT INTO held_amounts (token_id, amount, donation_id, held_until)
     VALUES (?, ?, ?, ?)`,
  ).run(donation.tokenId, donation.amount.toString(), donation.id, donation.heldUntil);
}
