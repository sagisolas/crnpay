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
  db.prepare("DELETE FROM held_addresses WHERE token_id = ? AND held_until <= ?").run(tokenId, now);
}

export function heldAmounts(db: Db, tokenId: string): Set<bigint> {
  const rows = db
    .prepare("SELECT amount FROM held_amounts WHERE token_id = ?")
    .pluck()
    .all(tokenId) as string[];
  return new Set(rows.map((amount) => BigInt(amount)));
}

export function insertDonation(
  db: Db,
  donation: DonationRecord,
  holdBy: "amount" | "address",
): void {
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
  if (holdBy === "address") {
    db.prepare(
      `INSERT INTO held_addresses (token_id, address, donation_id, held_until)
       VALUES (?, ?, ?, ?)`,
    ).run(donation.tokenId, donation.address, donation.id, donation.heldUntil);
    return;
  }
  db.prepare(
    `INSERT INTO held_amounts (token_id, amount, donation_id, held_until)
     VALUES (?, ?, ?, ?)`,
  ).run(donation.tokenId, donation.amount.toString(), donation.id, donation.heldUntil);
}

interface WalletAddress {
  index: number;
  address: string;
}

interface WalletKey {
  tokenId: string;
  wallet: string;
}

export function freeAddress(db: Db, key: WalletKey): WalletAddress | undefined {
  return db
    .prepare(
      `SELECT a.address_index AS "index", a.address FROM addresses a
       WHERE a.token_id = @tokenId AND a.wallet = @wallet AND a.funded = 0
         AND NOT EXISTS (
           SELECT 1 FROM held_addresses h WHERE h.token_id = a.token_id AND h.address = a.address
         )
       ORDER BY a.address_index LIMIT 1`,
    )
    .get(key) as WalletAddress | undefined;
}

export function unfundedAddressCount(db: Db, key: WalletKey): number {
  return db
    .prepare(
      "SELECT COUNT(*) FROM addresses WHERE token_id = @tokenId AND wallet = @wallet AND funded = 0",
    )
    .pluck()
    .get(key) as number;
}

export function nextAddressIndex(db: Db, key: WalletKey): number {
  const max = db
    .prepare(
      "SELECT MAX(address_index) FROM addresses WHERE token_id = @tokenId AND wallet = @wallet",
    )
    .pluck()
    .get(key) as number | null;
  return max === null ? 0 : max + 1;
}

export function insertAddress(
  db: Db,
  address: WalletKey & WalletAddress & { funded: boolean },
): void {
  db.prepare(
    `INSERT INTO addresses (token_id, wallet, address_index, address, funded)
     VALUES (@tokenId, @wallet, @index, @address, @funded)`,
  ).run({ ...address, funded: address.funded ? 1 : 0 });
}

export function markAddressFunded(db: Db, tokenId: string, address: string): void {
  db.prepare("UPDATE addresses SET funded = 1 WHERE token_id = ? AND address = ?").run(
    tokenId,
    address,
  );
}

export function watchedAddresses(db: Db, tokenId: string, now: number): string[] {
  return db
    .prepare(
      `SELECT d.address FROM donations d
       WHERE d.token_id = @tokenId AND (
         EXISTS (SELECT 1 FROM held_addresses h WHERE h.donation_id = d.id AND h.held_until > @now)
         OR (d.confirmed_at IS NULL AND EXISTS (SELECT 1 FROM transfers t WHERE t.donation_id = d.id))
       )
       GROUP BY d.address`,
    )
    .pluck()
    .all({ tokenId, now }) as string[];
}

export interface DonationView {
  id: string;
  tokenId: string;
  amount: bigint;
  address: string;
  message: string;
  nickname: string | null;
  expiresAt: number;
  confirmedAt: number | null;
  paymentConfirmations: number | null;
  paidAmount: bigint | null;
}

type DonationViewRow = Omit<DonationView, "amount" | "paidAmount"> & {
  amount: string;
  paidAmount: string | null;
};

export function findDonation(db: Db, id: string): DonationView | undefined {
  const row = db
    .prepare(
      `SELECT d.id, d.token_id AS tokenId, d.amount, d.address, d.message, d.nickname,
              d.expires_at AS expiresAt, d.confirmed_at AS confirmedAt,
              t.confirmations AS paymentConfirmations, t.amount AS paidAmount
       FROM donations d LEFT JOIN transfers t ON t.donation_id = d.id
       WHERE d.id = ?`,
    )
    .get(id) as DonationViewRow | undefined;
  return (
    row && {
      ...row,
      amount: BigInt(row.amount),
      paidAmount: row.paidAmount === null ? null : BigInt(row.paidAmount),
    }
  );
}

interface TransferKey {
  network: string;
  tokenId: string;
  txId: string;
  index: number;
}

export function findTransfer(
  db: Db,
  key: TransferKey,
): { donationId: string | null; confirmations: number } | undefined {
  return db
    .prepare(
      `SELECT donation_id AS donationId, confirmations FROM transfers
       WHERE network = @network AND token_id = @tokenId AND tx_id = @txId AND output_index = @index`,
    )
    .get(key) as { donationId: string | null; confirmations: number } | undefined;
}

export function findUnpaidHeldByAmount(
  db: Db,
  match: { tokenId: string; address: string; amount: bigint; now: number },
): string | undefined {
  return db
    .prepare(
      `SELECT d.id FROM held_amounts h JOIN donations d ON d.id = h.donation_id
       WHERE h.token_id = @tokenId AND h.amount = @amount AND h.held_until > @now
         AND d.address = @address
         AND NOT EXISTS (SELECT 1 FROM transfers t WHERE t.donation_id = d.id)`,
    )
    .pluck()
    .get({ ...match, amount: match.amount.toString() }) as string | undefined;
}

export function findUnpaidHeldByAddress(
  db: Db,
  match: { tokenId: string; address: string; now: number },
): string | undefined {
  return db
    .prepare(
      `SELECT h.donation_id FROM held_addresses h
       WHERE h.token_id = @tokenId AND h.address = @address AND h.held_until > @now
         AND NOT EXISTS (SELECT 1 FROM transfers t WHERE t.donation_id = h.donation_id)`,
    )
    .pluck()
    .get(match) as string | undefined;
}

export function insertTransfer(
  db: Db,
  transfer: TransferKey & {
    address: string;
    amount: bigint;
    confirmations: number;
    seenAt: number;
    donationId: string | null;
  },
): void {
  db.prepare(
    `INSERT INTO transfers
       (network, tx_id, output_index, token_id, address, amount, confirmations, seen_at, donation_id)
     VALUES
       (@network, @txId, @index, @tokenId, @address, @amount, @confirmations, @seenAt, @donationId)`,
  ).run({ ...transfer, amount: transfer.amount.toString() });
}

export function updateTransferConfirmations(db: Db, key: TransferKey, confirmations: number): void {
  db.prepare(
    `UPDATE transfers SET confirmations = @confirmations
     WHERE network = @network AND token_id = @tokenId AND tx_id = @txId AND output_index = @index`,
  ).run({ ...key, confirmations });
}

export function markConfirmed(db: Db, donationId: string, now: number): boolean {
  const result = db
    .prepare("UPDATE donations SET confirmed_at = ? WHERE id = ? AND confirmed_at IS NULL")
    .run(now, donationId);
  return result.changes > 0;
}

export function insertAlert(
  db: Db,
  alert: { id: string; donationId: string; createdAt: number },
): void {
  db.prepare(
    "INSERT INTO alerts (id, donation_id, created_at) VALUES (@id, @donationId, @createdAt)",
  ).run(alert);
}

export interface AlertRecord {
  id: string;
  tokenId: string;
  amount: bigint;
  nickname: string | null;
  message: string;
}

type AlertRow = Omit<AlertRecord, "amount"> & { amount: string };

const ALERT_COLUMNS = `a.id, d.token_id AS tokenId, t.amount, d.nickname, d.message
  FROM alerts a
  JOIN donations d ON d.id = a.donation_id
  JOIN transfers t ON t.donation_id = d.id`;

const toAlertRecord = (row: AlertRow): AlertRecord => ({ ...row, amount: BigInt(row.amount) });

export function findAlert(db: Db, id: string): AlertRecord | undefined {
  const row = db.prepare(`SELECT ${ALERT_COLUMNS} WHERE a.id = ?`).get(id) as AlertRow | undefined;
  return row && toAlertRecord(row);
}

export function unshownAlerts(db: Db, createdAfter: number): AlertRecord[] {
  const rows = db
    .prepare(
      `SELECT ${ALERT_COLUMNS}
       WHERE a.shown_at IS NULL AND a.created_at > ?
       ORDER BY a.created_at, a.rowid`,
    )
    .all(createdAfter) as AlertRow[];
  return rows.map(toAlertRecord);
}

export function markAlertShown(db: Db, id: string, now: number): boolean {
  const result = db
    .prepare("UPDATE alerts SET shown_at = ? WHERE id = ? AND shown_at IS NULL")
    .run(now, id);
  return result.changes > 0;
}

export function readCursor(db: Db, tokenId: string): string | null {
  const cursor = db
    .prepare("SELECT cursor FROM chain_cursors WHERE token_id = ?")
    .pluck()
    .get(tokenId) as string | undefined;
  return cursor ?? null;
}

export function writeCursor(db: Db, tokenId: string, cursor: string | null): void {
  if (cursor === null) {
    return;
  }
  db.prepare(
    `INSERT INTO chain_cursors (token_id, cursor) VALUES (?, ?)
     ON CONFLICT (token_id) DO UPDATE SET cursor = excluded.cursor`,
  ).run(tokenId, cursor);
}
