import { describe, expect, it, vi } from "vitest";
import { parseConfig, type UniqueAddressToken } from "../platform/config.js";
import { btc } from "../test-support/app.js";
import { createBitcoinAdapter } from "./bitcoin-adapter.js";

const token = parseConfig({ streamerName: "Matvey", tokens: [btc] })
  .tokens[0] as UniqueAddressToken;

const FIRST = "bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu";
const SECOND = "bc1qnjg0jd8228aq7egyzacy8cys3knf9xvrerkf9g";
const STRANGER = "bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq";

function output(address: string | undefined, value: number) {
  return {
    scriptpubkey: "0014c0cebcd6c3d3ca8c75dc5ec62ebe55330ef910e2",
    scriptpubkey_asm: "OP_0 OP_PUSHBYTES_20 c0cebcd6c3d3ca8c75dc5ec62ebe55330ef910e2",
    scriptpubkey_type: address ? "v0_p2wpkh" : "op_return",
    ...(address ? { scriptpubkey_address: address } : {}),
    value,
  };
}

function tx(txid: string, vout: unknown[], status: unknown) {
  return {
    txid,
    version: 2,
    locktime: 0,
    vin: [{ txid: "f".repeat(64), vout: 1, is_coinbase: false, sequence: 4294967293 }],
    vout,
    size: 222,
    weight: 561,
    fee: 1410,
    status,
  };
}

const confirmedAt = (height: number) => ({
  confirmed: true,
  block_height: height,
  block_hash: "0".repeat(64),
  block_time: 1763640000,
});

const unconfirmed = { confirmed: false };

function addressStats(txCount: number, mempoolTxCount = 0) {
  const stats = (count: number) => ({
    funded_txo_count: count,
    funded_txo_sum: count * 10_000,
    spent_txo_count: 0,
    spent_txo_sum: 0,
    tx_count: count,
  });
  return { address: FIRST, chain_stats: stats(txCount), mempool_stats: stats(mempoolTxCount) };
}

function stubFetch(routes: Record<string, unknown>) {
  return vi.fn((url: string) => {
    const path = new URL(url).pathname.replace(/^\/api/, "");
    if (!(path in routes)) {
      return Promise.resolve(new Response("not found", { status: 404 }));
    }
    const body = routes[path];
    return Promise.resolve(new Response(typeof body === "string" ? body : JSON.stringify(body)));
  });
}

describe("createBitcoinAdapter", () => {
  it.each([
    [0, FIRST],
    [1, SECOND],
  ])("derives BIP84 receive address %i from the published test vector", async (index, address) => {
    const adapter = createBitcoinAdapter({ fetchFn: stubFetch({}) });
    expect(await adapter.addressAt(token, index)).toBe(address);
  });

  it("lists outputs paying the watched addresses with confirmations from the tip", async () => {
    const fetchFn = stubFetch({
      "/blocks/tip/height": "870010",
      [`/address/${FIRST}/txs`]: [
        tx(
          "a".repeat(64),
          [output(STRANGER, 50_000), output(FIRST, 120_000), output(undefined, 0)],
          unconfirmed,
        ),
        tx("b".repeat(64), [output(FIRST, 15_000)], confirmedAt(870000)),
      ],
      [`/address/${SECOND}/txs`]: [],
    });
    const adapter = createBitcoinAdapter({ fetchFn });

    const page = await adapter.incomingTransfers(token, [FIRST, SECOND], null);

    expect(page).toEqual({
      transfers: [
        { txId: "a".repeat(64), index: 1, address: FIRST, amount: 120_000n, confirmations: 0 },
        { txId: "b".repeat(64), index: 0, address: FIRST, amount: 15_000n, confirmations: 11 },
      ],
      cursor: null,
    });
  });

  it("asks the provider nothing when no address is watched", async () => {
    const fetchFn = stubFetch({});
    const adapter = createBitcoinAdapter({ fetchFn });
    expect(await adapter.incomingTransfers(token, [], null)).toEqual({
      transfers: [],
      cursor: null,
    });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it.each([
    [addressStats(0), false],
    [addressStats(2), true],
    [addressStats(0, 1), true],
  ])("tells whether an address was ever used (%j)", async (stats, used) => {
    const adapter = createBitcoinAdapter({ fetchFn: stubFetch({ [`/address/${FIRST}`]: stats }) });
    expect(await adapter.isAddressUsed(token, FIRST)).toBe(used);
  });

  it.each([
    ["a non-numeric tip", { "/blocks/tip/height": "soon", [`/address/${FIRST}/txs`]: [] }],
    [
      "a fractional value",
      {
        "/blocks/tip/height": "870010",
        [`/address/${FIRST}/txs`]: [tx("c".repeat(64), [output(FIRST, 1.5)], unconfirmed)],
      },
    ],
    [
      "a confirmed tx without a height",
      {
        "/blocks/tip/height": "870010",
        [`/address/${FIRST}/txs`]: [tx("c".repeat(64), [output(FIRST, 1)], { confirmed: true })],
      },
    ],
    ["a non-array tx list", { "/blocks/tip/height": "870010", [`/address/${FIRST}/txs`]: {} }],
    ["an HTTP error", { "/blocks/tip/height": "870010" }],
  ])("rejects %s", async (_name, routes) => {
    const adapter = createBitcoinAdapter({ fetchFn: stubFetch(routes) });
    await expect(adapter.incomingTransfers(token, [FIRST], null)).rejects.toThrow();
  });

  it("rejects malformed address stats", async () => {
    const adapter = createBitcoinAdapter({
      fetchFn: stubFetch({ [`/address/${FIRST}`]: { chain_stats: {} } }),
    });
    await expect(adapter.isAddressUsed(token, FIRST)).rejects.toThrow();
  });
});
