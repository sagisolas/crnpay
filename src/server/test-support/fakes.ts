import type { ChainAdapter, IncomingTransfer } from "../chain-adapter.js";
import type { Scheduler } from "../scheduler.js";

export function createFakeClock(start: string) {
  const clock = { time: new Date(start).getTime(), now: () => clock.time };
  return clock;
}

export function createFakeScheduler(clock: { time: number }) {
  const tasks: { intervalMs: number; nextAt: number; task: () => Promise<void> }[] = [];

  const scheduler: Scheduler = {
    every(intervalMs, task) {
      tasks.push({ intervalMs, nextAt: clock.time + intervalMs, task });
    },
  };

  const advance = async (ms: number): Promise<void> => {
    const target = clock.time + ms;
    for (;;) {
      const due = tasks
        .filter((entry) => entry.nextAt <= target)
        .sort((a, b) => a.nextAt - b.nextAt)[0];
      if (!due) {
        break;
      }
      clock.time = due.nextAt;
      await due.task();
      due.nextAt += due.intervalMs;
    }
    clock.time = target;
  };

  return { scheduler, advance };
}

export function createFakeChain() {
  const transfers = new Map<string, IncomingTransfer[]>();
  let failure: Error | null = null;

  const adapter: ChainAdapter = {
    incomingTransfers(token) {
      if (failure) {
        return Promise.reject(failure);
      }
      const list = transfers.get(token.id) ?? [];
      return Promise.resolve({
        transfers: list.map((t) => ({ ...t })),
        cursor: String(list.length),
      });
    },
  };

  const send = (tokenId: string, transfer: IncomingTransfer): void => {
    transfers.set(tokenId, [
      ...(transfers.get(tokenId) ?? []).filter(
        (t) => t.txId !== transfer.txId || t.index !== transfer.index,
      ),
      transfer,
    ]);
  };

  const failWith = (error: Error | null): void => {
    failure = error;
  };

  return { adapter, send, failWith };
}
