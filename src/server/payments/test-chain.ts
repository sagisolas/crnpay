import { randomUUID } from "node:crypto";
import type { ChainAdapter, IncomingTransfer } from "./chain-adapter.js";
import type { TestToken } from "../platform/config.js";

export const TEST_TOKEN: TestToken = {
  id: "test",
  symbol: "TST",
  network: "test",
  networkName: "Test network",
  chain: "test",
  decimals: 6,
  minimum: 10_000n,
  confirmations: 2,
  address: "test-address",
  amountTailStep: 1n,
  matching: "uniqueAmount",
};

export function createTestChain() {
  let pending: IncomingTransfer[] = [];

  const adapter: ChainAdapter = {
    incomingTransfers() {
      const mined = pending.map((transfer) => ({
        ...transfer,
        confirmations: transfer.confirmations + 1,
      }));
      pending = mined.filter((transfer) => transfer.confirmations < TEST_TOKEN.confirmations);
      return Promise.resolve({ transfers: mined, cursor: null });
    },
  };

  const send = (amount: bigint): void => {
    pending.push({
      txId: `test-${randomUUID()}`,
      index: 0,
      address: TEST_TOKEN.address,
      amount,
      confirmations: 0,
    });
  };

  return { adapter, send };
}
