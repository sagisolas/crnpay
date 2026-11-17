import type { Logger } from "pino";
import { formatAmount } from "../shared/amount.js";
import type { AlertEvent } from "../shared/alert.js";
import type { Clock } from "./clock.js";
import type { UniqueAmountToken } from "./config.js";
import { findAlert, markAlertShown, unshownAlerts, type AlertRecord, type Db } from "./storage.js";

const REPLAY_WINDOW_MS = 60 * 60 * 1000;

type Listener = (alert: AlertEvent) => void;

interface AlertsDeps {
  db: Db;
  clock: Clock;
  logger: Logger;
  tokens: ReadonlyMap<string, UniqueAmountToken>;
}

export function createAlerts({ db, clock, logger, tokens }: AlertsDeps) {
  const listeners = new Set<Listener>();

  const toEvent = (record: AlertRecord): AlertEvent[] => {
    const token = tokens.get(record.tokenId);
    if (!token) {
      logger.warn(
        { alertId: record.id, tokenId: record.tokenId },
        "alert for unknown token skipped",
      );
      return [];
    }
    return [
      {
        id: record.id,
        nickname: record.nickname,
        amount: formatAmount(record.amount, token.decimals),
        symbol: token.symbol,
        message: record.message,
      },
    ];
  };

  const connect = (listener: Listener): (() => void) => {
    unshownAlerts(db, clock.now() - REPLAY_WINDOW_MS)
      .flatMap(toEvent)
      .forEach(listener);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  };

  const publish = (alertId: string): void => {
    const record = findAlert(db, alertId);
    (record ? toEvent(record) : []).forEach((alert) => {
      listeners.forEach((listener) => {
        listener(alert);
      });
    });
  };

  const markShown = (alertId: string): void => {
    if (markAlertShown(db, alertId, clock.now())) {
      logger.info({ alertId }, "alert shown");
    }
  };

  return { connect, publish, markShown };
}
