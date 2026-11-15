import { describe, expect, it } from "vitest";
import { parseConfig } from "./config.js";

const usdtOnTron = {
  id: "usdt-tron",
  symbol: "USDT",
  network: "tron",
  decimals: 6,
  minimum: "1",
  confirmations: 20,
  matching: "uniqueAmount",
  address: "TXYZ",
};

const btc = {
  id: "btc",
  symbol: "BTC",
  network: "bitcoin",
  decimals: 8,
  minimum: "0.0001",
  confirmations: 2,
  matching: "uniqueAddress",
  xpub: "zpub",
};

describe("parseConfig", () => {
  it("accepts an empty token list", () => {
    expect(parseConfig({ tokens: [] })).toEqual({ tokens: [] });
  });

  it("converts minimums to base units", () => {
    const config = parseConfig({ tokens: [usdtOnTron, btc] });
    expect(config.tokens.map((token) => token.minimum)).toEqual([1_000_000n, 10_000n]);
  });

  it("rejects duplicate token ids", () => {
    expect(() => parseConfig({ tokens: [usdtOnTron, usdtOnTron] })).toThrow("token ids must be unique");
  });

  it("rejects a minimum with more decimals than the token", () => {
    expect(() => parseConfig({ tokens: [{ ...usdtOnTron, minimum: "0.0000001" }] })).toThrow(
      "more than 6 decimal places",
    );
  });

  it("rejects a zero minimum", () => {
    expect(() => parseConfig({ tokens: [{ ...usdtOnTron, minimum: "0" }] })).toThrow(
      "must be greater than zero",
    );
  });

  it("rejects a numeric minimum", () => {
    expect(() => parseConfig({ tokens: [{ ...usdtOnTron, minimum: 1 }] })).toThrow();
  });

  it("rejects an unknown matching method", () => {
    expect(() => parseConfig({ tokens: [{ ...usdtOnTron, matching: "memo" }] })).toThrow();
  });

  it("rejects an xpub on a unique-amount token", () => {
    expect(() => parseConfig({ tokens: [{ ...usdtOnTron, xpub: "zpub" }] })).toThrow();
  });

  it("rejects a unique-address token without an xpub", () => {
    expect(() => parseConfig({ tokens: [{ ...btc, xpub: undefined }] })).toThrow();
  });

  it("rejects unknown top-level fields", () => {
    expect(() => parseConfig({ tokens: [], extra: true })).toThrow();
  });

  it.each([0, -1, 1.5])("rejects confirmations %j", (confirmations) => {
    expect(() => parseConfig({ tokens: [{ ...usdtOnTron, confirmations }] })).toThrow();
  });
});
