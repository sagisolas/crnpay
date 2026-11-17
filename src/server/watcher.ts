import type { Logger } from "pino";
import type { ChainAdapter, IncomingTransfer } from "./chain-adapter.js";
import type { UniqueAmountToken } from "./config.js";
import type { Scheduler } from "./scheduler.js";
import { readCursor, writeCursor, type Db } from "./storage.js";

const POLL_INTERVAL_MS = 15 * 1000;

interface WatcherDeps {
  db: Db;
  logger: Logger;
  scheduler: Scheduler;
  recordTransfers: (token: UniqueAmountToken, transfers: IncomingTransfer[]) => void;
}

export function watchToken(
  { db, logger, scheduler, recordTransfers }: WatcherDeps,
  token: UniqueAmountToken,
  adapter: ChainAdapter,
): void {
  scheduler.every(POLL_INTERVAL_MS, async () => {
    try {
      const page = await adapter.incomingTransfers(token, readCursor(db, token.id));
      recordTransfers(token, page.transfers);
      writeCursor(db, token.id, page.cursor);
    } catch (error) {
      logger.warn({ err: error, tokenId: token.id }, "payment watcher tick failed");
    }
  });
}
