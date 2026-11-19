import { describe, expect, it, vi } from "vitest";
import { parseConfig, type Token } from "../platform/config.js";
import { usdtOnTron } from "../test-support/app.js";
import { createTronAdapter } from "./tron-adapter.js";

const STREAMER = usdtOnTron.address;
const USDT = usdtOnTron.contract;
const TIP = 88143700;
const TIP_TIMESTAMP = 1795105170000;
const OLDEST_NOT_FINAL = TIP - usdtOnTron.confirmations + 1;

const token = (): Token => {
  const [tron] = parseConfig({ streamerName: "Matvey", tokens: [usdtOnTron] }).tokens;
  if (!tron) {
    throw new Error("missing token");
  }
  return tron;
};

const listUrls = (fetchFn: ReturnType<typeof stubFetch>): URL[] =>
  fetchFn.mock.calls.map(([url]) => new URL(url)).filter((url) => url.pathname.endsWith("/trc20"));

const blockHeader = (number: number, timestamp = TIP_TIMESTAMP - (TIP - number) * 3000) => ({
  blockID: "000000000540f74ebf34fdc839ca47028f38fc500bd4467fd3586d4bf43e0c09",
  block_header: {
    raw_data: {
      number,
      timestamp,
      txTrieRoot: "ac15a00dd8c344addec33c2fb00f51a6117b17c896cb04825fdfb5d9cdfdd6a7",
      parentHash: "000000000540f74d085ece8bdc7980442904241acf2f4d179aef2e5e0b55e6ff",
      witness_address: "414cdd560ded17f30e2c2d5422669cc86a14c8c3ba",
      version: 39,
    },
    witness_signature: "c6844b1986e59fe207f62f7fc4efc3d5c0f3503bab62e2cad37874b16f938a2528",
  },
});

function trc20Transfer(over: Record<string, unknown>) {
  return {
    transaction_id: "055a6326bd2a9ae30d1876aa1cd3c4dad7c985efc109e7e3a46c15c019924aab",
    token_info: { symbol: "USDT", address: USDT, decimals: 6, name: "Tether USD" },
    block_timestamp: 1795105152000,
    from: "TAK131aBQKUjyWaf5QHDot8Ny7WSKi2Cwb",
    to: STREAMER,
    type: "Transfer",
    value: "1422000000",
    ...over,
  };
}

const trc20Page = (data: unknown[], fingerprint?: string) => ({
  data,
  success: true,
  meta: { at: 1795105166161, page_size: data.length, ...(fingerprint ? { fingerprint } : {}) },
});

function txInfo(id: string, blockNumber: number, result = "SUCCESS") {
  return {
    id,
    fee: 345000,
    blockNumber,
    blockTimeStamp: 1795105152000,
    contractResult: ["0000000000000000000000000000000000000000000000000000000000000000"],
    contract_address: "41a614f803b6fd780986a42c78ec9c7f77e6ded13c",
    receipt: { energy_usage: 64285, energy_usage_total: 64285, net_fee: 345000, result },
    log: [],
  };
}

interface Provider {
  pages?: unknown[];
  info?: Record<string, unknown>;
  tip?: unknown;
}

function stubFetch({ pages = [trc20Page([])], info = {}, tip = blockHeader(TIP) }: Provider) {
  const remainingPages = [...pages];
  return vi.fn((url: string, init?: RequestInit) => {
    const { pathname } = new URL(url);
    const body = init?.body ? (JSON.parse(init.body as string) as Record<string, unknown>) : {};
    const respond = (value: unknown) => Promise.resolve(new Response(JSON.stringify(value)));
    if (pathname === "/wallet/getblock") {
      const number = body["id_or_num"];
      if (number === undefined) {
        return respond(tip);
      }
      if (number !== String(OLDEST_NOT_FINAL)) {
        throw new Error("unexpected block requested");
      }
      return respond(blockHeader(OLDEST_NOT_FINAL));
    }
    if (pathname === "/wallet/gettransactioninfobyid") {
      return respond(info[body["value"] as string] ?? {});
    }
    if (pathname === `/v1/accounts/${STREAMER}/transactions/trc20`) {
      return respond(remainingPages.shift() ?? trc20Page([]));
    }
    throw new Error(`unexpected request ${pathname}`);
  });
}

describe("createTronAdapter", () => {
  it("lists TRC-20 transfers to the Streamer, computing confirmations from the tip", async () => {
    const fetchFn = stubFetch({
      pages: [trc20Page([trc20Transfer({ transaction_id: "aa01", value: "5000000" })])],
      info: { aa01: txInfo("aa01", TIP - 4) },
    });
    const adapter = createTronAdapter({ apiKey: "KEY", fetchFn });
    const page = await adapter.incomingTransfers(token(), null);

    expect(page.transfers).toEqual([
      { txId: "aa01", index: 0, address: STREAMER, amount: 5_000_000n, confirmations: 5 },
    ]);
  });

  it("counts only transfers of the configured contract", async () => {
    const fetchFn = stubFetch({
      pages: [
        trc20Page([
          trc20Transfer({ transaction_id: "bb01" }),
          trc20Transfer({
            transaction_id: "bb02",
            token_info: { symbol: "USDT", address: "TXLAQ63Xg1NAzckPwKHvzw7CSEmLMEqcdj" },
          }),
        ]),
      ],
      info: { bb01: txInfo("bb01", TIP), bb02: txInfo("bb02", TIP) },
    });
    const adapter = createTronAdapter({ apiKey: "KEY", fetchFn });
    const page = await adapter.incomingTransfers(token(), null);

    expect(page.transfers.map((t) => t.txId)).toEqual(["bb01"]);
  });

  it("asks the provider only for incoming transfers of the configured contract", async () => {
    const fetchFn = stubFetch({});
    const adapter = createTronAdapter({ apiKey: "KEY", fetchFn });
    await adapter.incomingTransfers(token(), null);

    const [listUrl] = listUrls(fetchFn);
    expect(listUrl?.searchParams.get("only_to")).toBe("true");
    expect(listUrl?.searchParams.get("contract_address")).toBe(USDT);
  });

  it("ignores transfers to another address and zero-value transfers", async () => {
    const fetchFn = stubFetch({
      pages: [
        trc20Page([
          trc20Transfer({ transaction_id: "cc01", to: "TAK131aBQKUjyWaf5QHDot8Ny7WSKi2Cwb" }),
          trc20Transfer({ transaction_id: "cc02", value: "0" }),
        ]),
      ],
      info: { cc01: txInfo("cc01", TIP), cc02: txInfo("cc02", TIP) },
    });
    const adapter = createTronAdapter({ apiKey: "KEY", fetchFn });
    const page = await adapter.incomingTransfers(token(), null);
    expect(page.transfers).toEqual([]);
  });

  it("skips transfers whose transaction failed or is not yet in a block", async () => {
    const fetchFn = stubFetch({
      pages: [
        trc20Page([
          trc20Transfer({ transaction_id: "dd01" }),
          trc20Transfer({ transaction_id: "dd02" }),
          trc20Transfer({ transaction_id: "dd03" }),
        ]),
      ],
      info: { dd01: txInfo("dd01", TIP - 1, "REVERT"), dd03: txInfo("dd03", TIP) },
    });
    const adapter = createTronAdapter({ apiKey: "KEY", fetchFn });
    const page = await adapter.incomingTransfers(token(), null);
    expect(page.transfers.map((t) => t.txId)).toEqual(["dd03"]);
  });

  it("holds the cursor at a listed transfer the node has not yet put in a block", async () => {
    const fetchFn = stubFetch({
      pages: [
        trc20Page([trc20Transfer({ transaction_id: "dd04", block_timestamp: 1795100000000 })]),
      ],
    });
    const adapter = createTronAdapter({ apiKey: "KEY", fetchFn });
    const page = await adapter.incomingTransfers(token(), "1795090000000");

    expect(page.transfers).toEqual([]);
    expect(page.cursor).toBe("1795100000000");
  });

  it("gives each transfer sharing a transaction id a distinct, stable index", async () => {
    const fetchFn = stubFetch({
      pages: [
        trc20Page([
          trc20Transfer({ transaction_id: "ee01", value: "1000000" }),
          trc20Transfer({ transaction_id: "ee01", value: "2000000" }),
        ]),
      ],
      info: { ee01: txInfo("ee01", TIP) },
    });
    const adapter = createTronAdapter({ apiKey: "KEY", fetchFn });
    const page = await adapter.incomingTransfers(token(), null);

    expect(page.transfers.map((t) => [t.txId, t.index, t.amount])).toEqual([
      ["ee01", 0, 1_000_000n],
      ["ee01", 1, 2_000_000n],
    ]);
  });

  it("follows the provider's pagination", async () => {
    const fetchFn = stubFetch({
      pages: [
        trc20Page([trc20Transfer({ transaction_id: "ff01" })], "next-page"),
        trc20Page([trc20Transfer({ transaction_id: "ff02" })]),
      ],
      info: { ff01: txInfo("ff01", TIP), ff02: txInfo("ff02", TIP) },
    });
    const adapter = createTronAdapter({ apiKey: "KEY", fetchFn });
    const page = await adapter.incomingTransfers(token(), null);

    expect(page.transfers.map((t) => t.txId)).toEqual(["ff01", "ff02"]);
    expect(listUrls(fetchFn)[1]?.searchParams.get("fingerprint")).toBe("next-page");
  });

  it("returns the timestamp of the oldest not-yet-final block as the cursor", async () => {
    const fetchFn = stubFetch({});
    const adapter = createTronAdapter({ apiKey: "KEY", fetchFn });
    const page = await adapter.incomingTransfers(token(), null);

    expect(page.cursor).toBe(String(TIP_TIMESTAMP - (usdtOnTron.confirmations - 1) * 3000));
  });

  it("passes the stored cursor as the minimum timestamp", async () => {
    const fetchFn = stubFetch({});
    const adapter = createTronAdapter({ apiKey: "KEY", fetchFn });
    await adapter.incomingTransfers(token(), "1795100000000");

    expect(listUrls(fetchFn)[0]?.searchParams.get("min_timestamp")).toBe("1795100000000");
  });

  it("rejects a cursor that is not a timestamp", async () => {
    const adapter = createTronAdapter({ apiKey: "KEY", fetchFn: stubFetch({}) });
    await expect(adapter.incomingTransfers(token(), "abc")).rejects.toThrow();
  });

  it("sends the api key in a header, never in the url", async () => {
    const fetchFn = stubFetch({});
    const adapter = createTronAdapter({ apiKey: "SECRET", fetchFn });
    await adapter.incomingTransfers(token(), null);

    for (const [url, init] of fetchFn.mock.calls) {
      expect(url).not.toContain("SECRET");
      expect(new Headers(init?.headers).get("TRON-PRO-API-KEY")).toBe("SECRET");
    }
  });

  it("rejects a provider error without leaking the api key", async () => {
    const fetchFn = vi.fn(() => Promise.resolve(new Response("Unauthorized", { status: 401 })));
    const adapter = createTronAdapter({ apiKey: "SECRET", fetchFn });

    const failure = adapter.incomingTransfers(token(), null);
    await expect(failure).rejects.toThrow(/401/);
    await expect(failure).rejects.not.toThrow(/SECRET/);
  });

  it("rejects a malformed transfer list", async () => {
    const fetchFn = stubFetch({
      pages: [{ success: true, data: [{ transaction_id: "aa01" }], meta: {} }],
    });
    const adapter = createTronAdapter({ apiKey: "KEY", fetchFn });
    await expect(adapter.incomingTransfers(token(), null)).rejects.toThrow();
  });

  it("rejects a malformed block response", async () => {
    const fetchFn = stubFetch({ tip: { block_header: { raw_data: { number: "88143700" } } } });
    const adapter = createTronAdapter({ apiKey: "KEY", fetchFn });
    await expect(adapter.incomingTransfers(token(), null)).rejects.toThrow();
  });

  it("rejects a malformed transaction info response", async () => {
    const fetchFn = stubFetch({
      pages: [trc20Page([trc20Transfer({ transaction_id: "aa01" })])],
      info: { aa01: { blockNumber: "88143700" } },
    });
    const adapter = createTronAdapter({ apiKey: "KEY", fetchFn });
    await expect(adapter.incomingTransfers(token(), null)).rejects.toThrow();
  });
});
