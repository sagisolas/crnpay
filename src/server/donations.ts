import { randomInt, randomUUID } from "node:crypto";
import type { Logger } from "pino";
import { formatAmount } from "../shared/amount.js";
import {
  validateDonationInput,
  type DonationInput,
  type FieldErrors,
} from "../shared/donation-input.js";
import type { DonationStatus } from "../shared/donation-api.js";
import type { IncomingTransfer } from "./chain-adapter.js";
import type { Clock } from "./clock.js";
import type { UniqueAmountToken } from "./config.js";
import {
  findDonation,
  findTransfer,
  findUnpaidHeldDonation,
  heldAmounts,
  insertDonation,
  insertTransfer,
  markConfirmed,
  releaseExpiredHolds,
  updateTransferConfirmations,
  type Db,
  type DonationRecord,
  type DonationView,
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

type TransferEvent =
  | { kind: "unmatched"; transfer: IncomingTransfer }
  | { kind: "seen"; donationId: string; transfer: IncomingTransfer }
  | { kind: "confirmed"; donation: DonationView };

interface DonationsDeps {
  db: Db;
  clock: Clock;
  logger: Logger;
  tailSteps: number;
  tokens: ReadonlyMap<string, UniqueAmountToken>;
}

export function createDonations({ db, clock, logger, tailSteps, tokens }: DonationsDeps) {
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

  const confirmIfFinal = (token: UniqueAmountToken, donationId: string, confirmations: number) => {
    if (confirmations < token.confirmations || !markConfirmed(db, donationId, clock.now())) {
      return undefined;
    }
    return findDonation(db, donationId);
  };

  const recordTransfers = (token: UniqueAmountToken, transfers: IncomingTransfer[]): void => {
    const now = clock.now();
    const events = db.transaction(() =>
      transfers.flatMap((transfer): TransferEvent[] => {
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
          const confirmed = confirmIfFinal(token, known.donationId, transfer.confirmations);
          return confirmed ? [{ kind: "confirmed", donation: confirmed }] : [];
        }

        const donationId =
          findUnpaidHeldDonation(db, {
            tokenId: token.id,
            address: transfer.address,
            amount: transfer.amount,
            now,
          }) ?? null;
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
        const confirmed = confirmIfFinal(token, donationId, transfer.confirmations);
        return [
          { kind: "seen", donationId, transfer },
          ...(confirmed ? [{ kind: "confirmed" as const, donation: confirmed }] : []),
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
          amount: formatAmount(event.donation.amount, token.decimals),
          nickname: event.donation.nickname,
          message: event.donation.message,
        },
        "donation confirmed",
      );
    });
  };

  return { create, status, recordTransfers };
}
