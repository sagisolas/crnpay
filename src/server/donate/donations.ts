import { randomInt, randomUUID } from "node:crypto";
import type { Logger } from "pino";
import { formatAmount } from "../../shared/amount.js";
import {
  validateDonationInput,
  type DonationInput,
  type FieldErrors,
} from "../../shared/donation-input.js";
import type { DonationStatus } from "../../shared/donation-api.js";
import type { ChainAdapters, IncomingTransfer } from "../payments/chain-adapter.js";
import type { Clock } from "../platform/clock.js";
import type { Token, UniqueAddressToken, UniqueAmountToken } from "../platform/config.js";
import {
  deleteNeverPaidDonations,
  findDonation,
  findTransfer,
  findUnpaidHeldByAddress,
  findUnpaidHeldByAmount,
  freeAddress,
  heldAmountCount,
  heldAmounts,
  insertAddress,
  insertAlert,
  insertDonation,
  insertTransfer,
  markAddressFunded,
  markConfirmed,
  nextAddressIndex,
  releaseExpiredHolds,
  unfundedAddressCount,
  updateTransferConfirmations,
  type Db,
  type DonationRecord,
  type DonationView,
} from "../platform/storage.js";

const PAYMENT_WINDOW_MS = 60 * 60 * 1000;
const LATE_PAYMENT_HOLD_MS = 24 * 60 * 60 * 1000;
export const DEFAULT_TAIL_STEPS = 9999;
// Bounds storage under Donation spam from many IPs: about 2 KB per Donation (ADR-0011).
export const DEFAULT_MAX_HELD_DONATIONS = 100_000;
const MAX_ADDRESS_ATTEMPTS = 10;
// Standard wallets stop scanning after 20 unused addresses in a row (BIP44 gap limit).
const ADDRESS_GAP_LIMIT = 20;

type CreateDonationResult =
  | { ok: true; donation: DonationRecord }
  | { ok: false; error: "validation"; fields: FieldErrors }
  | { ok: false; error: "token_unavailable" };

function pickRandom<T>(items: T[]): T | undefined {
  return items.length > 0 ? items[randomInt(items.length)] : undefined;
}

type TransferEvent =
  | { kind: "unmatched"; transfer: IncomingTransfer }
  | { kind: "seen"; donationId: string; transfer: IncomingTransfer }
  | { kind: "confirmed"; donation: DonationView; alertId: string };

interface DonationsDeps {
  db: Db;
  clock: Clock;
  logger: Logger;
  tailSteps: number;
  maxHeldDonations: number;
  tokens: ReadonlyMap<string, Token>;
  adapters: ChainAdapters;
  onAlert: (alertId: string) => void;
}

type DonationFields = Pick<DonationRecord, "amount" | "message" | "nickname">;

export function createDonations({
  db,
  clock,
  logger,
  tailSteps,
  maxHeldDonations,
  tokens,
  adapters,
  onAlert,
}: DonationsDeps) {
  const freeAmounts = (token: UniqueAmountToken, base: bigint): bigint[] => {
    const held = heldAmounts(db, token.id);
    return Array.from(
      { length: tailSteps },
      (_, index) => base + BigInt(index + 1) * token.amountTailStep,
    ).filter((amount) => !held.has(amount));
  };

  const newRecord = (token: Token, fields: DonationFields, address: string): DonationRecord => {
    const now = clock.now();
    return {
      ...fields,
      id: randomUUID(),
      tokenId: token.id,
      address,
      createdAt: now,
      expiresAt: now + PAYMENT_WINDOW_MS,
      heldUntil: now + PAYMENT_WINDOW_MS + LATE_PAYMENT_HOLD_MS,
    };
  };

  const createWithAmount = (token: UniqueAmountToken, fields: DonationFields) =>
    db.transaction((): DonationRecord | null => {
      releaseExpiredHolds(db, token.id, clock.now());
      if (heldAmountCount(db, token.id) >= maxHeldDonations) {
        logger.warn({ tokenId: token.id }, "held donation limit reached, donation refused");
        return null;
      }
      const exact = pickRandom(freeAmounts(token, fields.amount));
      if (exact === undefined) {
        logger.warn({ tokenId: token.id }, "no free amount tail, donation refused");
        return null;
      }
      const record = newRecord(token, { ...fields, amount: exact }, token.address);
      insertDonation(db, record, "amount");
      return record;
    })();

  const claimAddress = (
    token: UniqueAddressToken,
    candidate: { index: number; address: string; known: boolean; used: boolean },
    fields: DonationFields,
  ): DonationRecord | null => {
    const key = { tokenId: token.id, wallet: token.wallet };
    const { index, address, known, used } = candidate;
    const stillFree = known
      ? freeAddress(db, key)?.address === address
      : nextAddressIndex(db, key) === index;
    if (!stillFree) {
      return null;
    }
    if (known && used) {
      markAddressFunded(db, token.id, address);
    }
    if (!known) {
      insertAddress(db, { ...key, index, address, funded: used });
    }
    if (used) {
      logger.info({ tokenId: token.id, index }, "address already used on chain, skipped");
      return null;
    }
    const created = newRecord(token, fields, address);
    insertDonation(db, created, "address");
    return created;
  };

  // Every address is checked unused on chain before it is handed out, so a wiped database
  // or a transfer that arrived after its hold can never attach an old Payment to a new Donation.
  const createWithAddress = async (
    token: UniqueAddressToken,
    fields: DonationFields,
  ): Promise<DonationRecord | null> => {
    const adapter = adapters[token.chain];
    if (!adapter) {
      logger.warn({ tokenId: token.id }, "no chain adapter, donation refused");
      return null;
    }
    const key = { tokenId: token.id, wallet: token.wallet };
    for (let attempt = 0; attempt < MAX_ADDRESS_ATTEMPTS; attempt++) {
      releaseExpiredHolds(db, token.id, clock.now());
      const known = freeAddress(db, key);
      if (!known && unfundedAddressCount(db, key) >= ADDRESS_GAP_LIMIT) {
        logger.warn({ tokenId: token.id }, "address gap limit reached, donation refused");
        return null;
      }
      const index = known?.index ?? nextAddressIndex(db, key);
      const address = known?.address ?? (await adapter.addressAt(token, index));
      const used = await adapter.isAddressUsed(token, address);
      const candidate = { index, address, known: known !== undefined, used };
      const record = db.transaction(() => claimAddress(token, candidate, fields))();
      if (record) {
        return record;
      }
    }
    logger.warn({ tokenId: token.id }, "no unused address found, donation refused");
    return null;
  };

  const create = async (token: Token, input: DonationInput): Promise<CreateDonationResult> => {
    const validation = validateDonationInput(input, token);
    if (!validation.ok) {
      return { ok: false, error: "validation", fields: validation.errors };
    }
    const donation =
      token.matching === "uniqueAmount"
        ? createWithAmount(token, validation.value)
        : await createWithAddress(token, validation.value).catch((error: unknown) => {
            logger.warn(
              { err: error, tokenId: token.id },
              "address assignment failed, donation refused",
            );
            return null;
          });
    if (!donation) {
      return { ok: false, error: "token_unavailable" };
    }
    logger.info(
      {
        donationId: donation.id,
        tokenId: token.id,
        amount: formatAmount(donation.amount, token.decimals),
      },
      "donation created",
    );
    return { ok: true, donation };
  };

  const status = (id: string): DonationStatus | undefined => {
    const donation = findDonation(db, id);
    const token = donation && tokens.get(donation.tokenId);
    if (!donation || !token) {
      return undefined;
    }
    if (donation.confirmedAt !== null) {
      return { state: "confirmed" };
    }
    if (donation.paymentConfirmations !== null) {
      return {
        state: "seen",
        confirmations: donation.paymentConfirmations,
        required: token.confirmations,
      };
    }
    return { state: clock.now() >= donation.expiresAt ? "expired" : "waiting" };
  };

  const confirmIfFinal = (
    token: Token,
    donationId: string,
    confirmations: number,
  ): TransferEvent[] => {
    const now = clock.now();
    if (confirmations < token.confirmations || !markConfirmed(db, donationId, now)) {
      return [];
    }
    const donation = findDonation(db, donationId);
    if (!donation) {
      return [];
    }
    const alertId = randomUUID();
    insertAlert(db, { id: alertId, donationId, createdAt: now });
    return [{ kind: "confirmed", donation, alertId }];
  };

  const matchDonation = (token: Token, transfer: IncomingTransfer, now: number) => {
    const match = { tokenId: token.id, address: transfer.address, now };
    if (token.matching === "uniqueAmount") {
      return findUnpaidHeldByAmount(db, { ...match, amount: transfer.amount });
    }
    return transfer.amount >= token.minimum ? findUnpaidHeldByAddress(db, match) : undefined;
  };

  const recordTransfers = (token: Token, transfers: IncomingTransfer[]): void => {
    const now = clock.now();
    const oldestFirst = transfers
      .filter((transfer) => transfer.confirmations > 0)
      .sort((a, b) => b.confirmations - a.confirmations);
    const events = db.transaction(() =>
      oldestFirst.flatMap((transfer): TransferEvent[] => {
        const key = {
          network: token.network,
          tokenId: token.id,
          txId: transfer.txId,
          index: transfer.index,
        };
        const known = findTransfer(db, key);
        if (known) {
          if (!known.donationId || transfer.confirmations <= known.confirmations) {
            return [];
          }
          updateTransferConfirmations(db, key, transfer.confirmations);
          return confirmIfFinal(token, known.donationId, transfer.confirmations);
        }

        if (token.matching === "uniqueAddress") {
          markAddressFunded(db, token.id, transfer.address);
        }
        const donationId = matchDonation(token, transfer, now) ?? null;
        insertTransfer(db, {
          ...key,
          address: transfer.address,
          amount: transfer.amount,
          confirmations: transfer.confirmations,
          seenAt: now,
          donationId,
        });
        if (!donationId) {
          return [{ kind: "unmatched", transfer }];
        }
        return [
          { kind: "seen", donationId, transfer },
          ...confirmIfFinal(token, donationId, transfer.confirmations),
        ];
      }),
    )();

    events.forEach((event) => {
      if (event.kind === "unmatched") {
        logger.info(
          {
            tokenId: token.id,
            txId: event.transfer.txId,
            index: event.transfer.index,
            address: event.transfer.address,
            amount: formatAmount(event.transfer.amount, token.decimals),
          },
          "unmatched transfer",
        );
        return;
      }
      if (event.kind === "seen") {
        logger.info(
          {
            donationId: event.donationId,
            tokenId: token.id,
            txId: event.transfer.txId,
            index: event.transfer.index,
            confirmations: event.transfer.confirmations,
          },
          "payment seen",
        );
        return;
      }
      logger.info(
        {
          donationId: event.donation.id,
          tokenId: token.id,
          amount: formatAmount(event.donation.paidAmount ?? event.donation.amount, token.decimals),
          nickname: event.donation.nickname,
          message: event.donation.message,
        },
        "donation confirmed",
      );
      onAlert(event.alertId);
    });
  };

  const find = (id: string): DonationView | undefined => findDonation(db, id);

  const forgetNeverPaid = (): void => {
    try {
      const count = db.transaction(() => deleteNeverPaidDonations(db, clock.now()))();
      if (count > 0) {
        logger.info({ count }, "never-paid donations forgotten");
      }
    } catch (error) {
      logger.error({ err: error }, "forgetting never-paid donations failed");
    }
  };

  return { create, find, status, recordTransfers, forgetNeverPaid };
}
