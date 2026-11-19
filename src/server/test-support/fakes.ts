import type {
  ChainAdapter,
  IncomingTransfer,
  UniqueAddressAdapter,
} from "../payments/chain-adapter.js";
import type { Scheduler } from "../platform/scheduler.js";

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

  const usedAddresses = new Set<string>();

  const addressAdapter: UniqueAddressAdapter = {
    addressAt(token, index) {
      return Promise.resolve(`${token.id}-address-${String(index)}`);
    },
    isAddressUsed(token, address) {
      if (failure) {
        return Promise.reject(failure);
      }
      const received = (transfers.get(token.id) ?? []).some((t) => t.address === address);
      return Promise.resolve(received || usedAddresses.has(address));
    },
    incomingTransfers(token, addresses) {
      if (failure) {
        return Promise.reject(failure);
      }
      const list = (transfers.get(token.id) ?? []).filter((t) => addresses.includes(t.address));
      return Promise.resolve({ transfers: list.map((t) => ({ ...t })), cursor: null });
    },
  };

  const markUsed = (address: string): void => {
    usedAddresses.add(address);
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

  return { adapter, addressAdapter, send, markUsed, failWith };
}
