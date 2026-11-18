import { describe, expect, it, vi } from "vitest";
import { parseConfig } from "../platform/config.js";
import { ethOnEthereum, usdtOnEthereum } from "../test-support/app.js";
import { createEvmAdapter } from "./evm-adapter.js";
import type { UniqueAmountToken } from "../platform/config.js";

const STREAMER = ethOnEthereum.address;

function evmToken(raw: typeof ethOnEthereum | typeof usdtOnEthereum): UniqueAmountToken {
  return parseConfig({ streamerName: "Matvey", tokens: [raw] }).tokens[0] as UniqueAmountToken;
}

const blockNumber = (hex: string) => ({ jsonrpc: "2.0", id: 1, result: hex });
const ok = (result: unknown[]) => ({ status: "1", message: "OK", result });
const empty = () => ({ status: "0", message: "No transactions found", result: [] });

function nativeTx(over: Record<string, string>) {
  return {
    blockNumber: "100",
    timeStamp: "1700000000",
    hash: "0xaaa",
    from: "0x1111111111111111111111111111111111111111",
    to: STREAMER.toLowerCase(),
    value: "1000000000000000000",
    isError: "0",
    ...over,
  };
}

function tokenTx(over: Record<string, string>) {
  return {
    blockNumber: "100",
    timeStamp: "1700000000",
    hash: "0xbbb",
    from: "0x1111111111111111111111111111111111111111",
    contractAddress: usdtOnEthereum.contract.toLowerCase(),
    to: STREAMER.toLowerCase(),
    value: "5000000",
    ...over,
  };
}

function stubFetch(byAction: Record<string, unknown>) {
  return vi.fn((url: string | URL) => {
    const action = new URL(url).searchParams.get("action") ?? "";
    const body = byAction[action];
    if (body === undefined) {
      throw new Error(`unexpected action ${action}`);
    }
    return Promise.resolve(new Response(JSON.stringify(body)));
  });
}

const noWait = (): Promise<void> => Promise.resolve();

describe("createEvmAdapter", () => {
  it("lists native ETH transfers to the Streamer, computing confirmations from the tip", async () => {
    const fetchFn = stubFetch({
      eth_blockNumber: blockNumber("0x6f"),
      txlist: ok([nativeTx({ blockNumber: "100", hash: "0xaaa" })]),
      txlistinternal: empty(),
    });
    const adapter = createEvmAdapter({ apiKey: "KEY", fetchFn, wait: noWait });
    const page = await adapter.incomingTransfers(evmToken(ethOnEthereum), null);

    expect(page.transfers).toEqual([
      {
        txId: "0xaaa",
        index: 0,
        address: STREAMER,
        amount: 1_000_000_000_000_000_000n,
        confirmations: 12,
      },
    ]);
  });

  it("includes internal transfers from contract wallets", async () => {
    const fetchFn = stubFetch({
      eth_blockNumber: blockNumber("0x6f"),
      txlist: empty(),
      txlistinternal: ok([
        nativeTx({ hash: "0xccc", blockNumber: "109", value: "2000000000000000000" }),
      ]),
    });
    const adapter = createEvmAdapter({ apiKey: "KEY", fetchFn, wait: noWait });
    const page = await adapter.incomingTransfers(evmToken(ethOnEthereum), null);

    expect(page.transfers).toEqual([
      {
        txId: "0xccc",
        index: 0,
        address: STREAMER,
        amount: 2_000_000_000_000_000_000n,
        confirmations: 3,
      },
    ]);
  });

  it("ignores native transfers to another address or with a failed status", async () => {
    const fetchFn = stubFetch({
      eth_blockNumber: blockNumber("0x6f"),
      txlist: ok([
        nativeTx({ to: "0x9999999999999999999999999999999999999999", hash: "0xd1" }),
        nativeTx({ isError: "1", hash: "0xd2" }),
        nativeTx({ value: "0", hash: "0xd3" }),
      ]),
      txlistinternal: empty(),
    });
    const adapter = createEvmAdapter({ apiKey: "KEY", fetchFn, wait: noWait });
    const page = await adapter.incomingTransfers(evmToken(ethOnEthereum), null);
    expect(page.transfers).toEqual([]);
  });

  it("keeps indices distinct when a hash appears in both the external and internal lists", async () => {
    const fetchFn = stubFetch({
      eth_blockNumber: blockNumber("0x6f"),
      txlist: ok([nativeTx({ hash: "0xdual", value: "1000000000000000000" })]),
      txlistinternal: ok([nativeTx({ hash: "0xdual", value: "2000000000000000000" })]),
    });
    const adapter = createEvmAdapter({ apiKey: "KEY", fetchFn, wait: noWait });
    const page = await adapter.incomingTransfers(evmToken(ethOnEthereum), null);

    expect(page.transfers.map((t) => [t.txId, t.index])).toEqual([
      ["0xdual", 0],
      ["0xdual", 1],
    ]);
  });

  it("accepts rows whose `to` is empty without rejecting the whole page", async () => {
    const fetchFn = stubFetch({
      eth_blockNumber: blockNumber("0x6f"),
      txlist: ok([
        nativeTx({ to: "", hash: "0xcreate", value: "0" }),
        nativeTx({ hash: "0xpay", value: "1000000000000000000" }),
      ]),
      txlistinternal: empty(),
    });
    const adapter = createEvmAdapter({ apiKey: "KEY", fetchFn, wait: noWait });
    const page = await adapter.incomingTransfers(evmToken(ethOnEthereum), null);
    expect(page.transfers.map((t) => t.txId)).toEqual(["0xpay"]);
  });

  it("lists only ERC-20 transfers of the configured contract", async () => {
    const fetchFn = stubFetch({
      eth_blockNumber: blockNumber("0x6f"),
      tokentx: ok([
        tokenTx({ hash: "0xb1", value: "5000000" }),
        tokenTx({
          hash: "0xb2",
          contractAddress: "0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
          value: "9999999",
        }),
      ]),
    });
    const adapter = createEvmAdapter({ apiKey: "KEY", fetchFn, wait: noWait });
    const page = await adapter.incomingTransfers(evmToken(usdtOnEthereum), null);

    expect(page.transfers).toEqual([
      { txId: "0xb1", index: 0, address: STREAMER, amount: 5_000_000n, confirmations: 12 },
    ]);
  });

  it("gives each transfer sharing a hash a distinct, stable index", async () => {
    const fetchFn = stubFetch({
      eth_blockNumber: blockNumber("0x6f"),
      tokentx: ok([
        tokenTx({ hash: "0xsame", value: "1000000" }),
        tokenTx({ hash: "0xsame", value: "2000000" }),
      ]),
    });
    const adapter = createEvmAdapter({ apiKey: "KEY", fetchFn, wait: noWait });
    const page = await adapter.incomingTransfers(evmToken(usdtOnEthereum), null);

    expect(page.transfers.map((t) => [t.txId, t.index])).toEqual([
      ["0xsame", 0],
      ["0xsame", 1],
    ]);
  });

  it("returns a cursor that keeps re-reporting not-yet-final transfers", async () => {
    const fetchFn = stubFetch({
      eth_blockNumber: blockNumber("0x6f"),
      txlist: ok([nativeTx({ blockNumber: "105" })]),
      txlistinternal: empty(),
    });
    const adapter = createEvmAdapter({ apiKey: "KEY", fetchFn, wait: noWait });
    const page = await adapter.incomingTransfers(evmToken(ethOnEthereum), null);

    expect(page.cursor).toBe("100");
  });

  it("passes the stored cursor as the startblock", async () => {
    const fetchFn = stubFetch({
      eth_blockNumber: blockNumber("0x6f"),
      txlist: empty(),
      txlistinternal: empty(),
    });
    const adapter = createEvmAdapter({ apiKey: "KEY", fetchFn, wait: noWait });
    await adapter.incomingTransfers(evmToken(ethOnEthereum), "100");

    const listCall = fetchFn.mock.calls.find(
      ([url]) => new URL(url as string).searchParams.get("action") === "txlist",
    );
    expect(new URL(listCall![0] as string).searchParams.get("startblock")).toBe("100");
    expect(new URL(listCall![0] as string).searchParams.get("chainid")).toBe("1");
  });

  it("rejects a provider error without leaking the api key", async () => {
    const fetchFn = stubFetch({
      eth_blockNumber: blockNumber("0x6f"),
      txlist: { status: "0", message: "NOTOK", result: "Invalid API Key" },
      txlistinternal: empty(),
    });
    const adapter = createEvmAdapter({ apiKey: "SECRET", fetchFn, wait: noWait });

    await expect(adapter.incomingTransfers(evmToken(ethOnEthereum), null)).rejects.toThrow(
      /Invalid API Key/,
    );
    await expect(adapter.incomingTransfers(evmToken(ethOnEthereum), null)).rejects.not.toThrow(
      /SECRET/,
    );
  });

  it("spaces provider calls to stay under the rate limit", async () => {
    const waits: number[] = [];
    const fetchFn = stubFetch({
      eth_blockNumber: blockNumber("0x6f"),
      txlist: empty(),
      txlistinternal: empty(),
    });
    const adapter = createEvmAdapter({
      apiKey: "KEY",
      fetchFn,
      callsPerSecond: 3,
      wait: (ms) => {
        waits.push(ms);
        return Promise.resolve();
      },
    });
    await adapter.incomingTransfers(evmToken(ethOnEthereum), null);

    expect(waits).toHaveLength(3);
    const spaced = [...waits].sort((a, b) => a - b);
    expect(spaced[0]).toBe(0);
    expect(spaced[1]).toBeGreaterThanOrEqual(300);
    expect(spaced[2]).toBeGreaterThanOrEqual(600);
  });

  it("rejects a malformed provider response", async () => {
    const fetchFn = stubFetch({
      eth_blockNumber: blockNumber("0x6f"),
      txlist: { status: "1", message: "OK", result: [{ hash: "0xaaa" }] },
      txlistinternal: empty(),
    });
    const adapter = createEvmAdapter({ apiKey: "KEY", fetchFn, wait: noWait });
    await expect(adapter.incomingTransfers(evmToken(ethOnEthereum), null)).rejects.toThrow();
  });
});
