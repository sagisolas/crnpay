import { randomInt, randomUUID } from "node:crypto";
import type { Logger } from "pino";
import { formatAmount } from "../shared/amount.js";
import {
  validateDonationInput,
  type DonationInput,
  type FieldErrors,
} from "../shared/donation-input.js";
import type { Clock } from "./clock.js";
import type { UniqueAmountToken } from "./config.js";
import {
  heldAmounts,
  insertDonation,
  releaseExpiredHolds,
  type Db,
  type DonationRecord,
} from "./storage.js";

const PAYMENT_WINDOW_MS = 60 * 60 * 1000;
const LATE_PAYMENT_HOLD_MS = 24 * 60 * 60 * 1000;
export const DEFAULT_TAIL_STEPS = 9999;

type CreateDonationResult =
  | { ok: true; donation: DonationRecord }
  | { ok: false; error: "validation"; fields: FieldErrors }
  | { ok: false; error: "token_unavailable" };

function pickRandom<T>(items: T[]): T | undefined {
  return items.length > 0 ? items[randomInt(items.length)] : undefined;
}

interface DonationsDeps {
  db: Db;
  clock: Clock;
  logger: Logger;
  tailSteps: number;
}

export function createDonations({ db, clock, logger, tailSteps }: DonationsDeps) {
  const freeAmounts = (token: UniqueAmountToken, base: bigint): bigint[] => {
    const held = heldAmounts(db, token.id);
    return Array.from(
      { length: tailSteps },
      (_, index) => base + BigInt(index + 1) * token.amountTailStep,
    ).filter((amount) => !held.has(amount));
  };

  const create = (token: UniqueAmountToken, input: DonationInput): CreateDonationResult => {
    const validation = validateDonationInput(input, token);
    if (!validation.ok) {
      return { ok: false, error: "validation", fields: validation.errors };
    }
    const { amount, message, nickname } = validation.value;
    const now = clock.now();

    const donation = db.transaction((): DonationRecord | null => {
      releaseExpiredHolds(db, token.id, now);
      const exact = pickRandom(freeAmounts(token, amount));
      if (exact === undefined) {
        return null;
      }
      const record: DonationRecord = {
        id: randomUUID(),
        tokenId: token.id,
        amount: exact,
        address: token.address,
        message,
        nickname,
        createdAt: now,
        expiresAt: now + PAYMENT_WINDOW_MS,
        heldUntil: now + PAYMENT_WINDOW_MS + LATE_PAYMENT_HOLD_MS,
      };
      insertDonation(db, record);
      return record;
    })();

    if (!donation) {
      logger.warn({ tokenId: token.id }, "no free amount tail, donation refused");
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

  return { create };
}
