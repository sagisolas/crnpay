import type { Logger } from "pino";
import type { IncomingTransfer, TransferPage } from "./chain-adapter.js";
import type { Token } from "../platform/config.js";
import type { Scheduler } from "../platform/scheduler.js";
import { readCursor, writeCursor, type Db } from "../platform/storage.js";

const POLL_INTERVAL_MS = 15 * 1000;

interface WatcherDeps {
  db: Db;
  logger: Logger;
  scheduler: Scheduler;
  recordTransfers: (token: Token, transfers: IncomingTransfer[]) => void;
}

export function watchToken(
  { db, logger, scheduler, recordTransfers }: WatcherDeps,
  token: Token,
  poll: (cursor: string | null) => Promise<TransferPage>,
): void {
  scheduler.every(POLL_INTERVAL_MS, async () => {
    try {
      const page = await poll(readCursor(db, token.id));
      recordTransfers(token, page.transfers);
      writeCursor(db, token.id, page.cursor);
    } catch (error) {
      logger.warn({ err: error, tokenId: token.id }, "payment watcher tick failed");
    }
  });
}
