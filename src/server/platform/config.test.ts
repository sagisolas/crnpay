import { describe, expect, it } from "vitest";
import { parseConfig } from "./config.js";
import { btc, usdtOnTron, xmr } from "../test-support/app.js";

const config = (tokens: unknown[]) => ({ streamerName: "Matvey", tokens });

describe("parseConfig", () => {
  it("accepts an empty token list", () => {
    expect(parseConfig(config([]))).toEqual({ streamerName: "Matvey", tokens: [] });
  });

  it("requires the streamer name", () => {
    expect(() => parseConfig({ tokens: [] })).toThrow();
    expect(() => parseConfig({ streamerName: " ", tokens: [] })).toThrow();
  });

  it("converts minimums and tail steps to base units", () => {
    const [tron, bitcoin] = parseConfig(config([usdtOnTron, btc])).tokens;
    expect(tron).toMatchObject({ minimum: 1_000_000n, amountTailStep: 100n });
    expect(bitcoin).toMatchObject({ minimum: 10_000n });
  });

  it("derives the matching method from the chain", () => {
    const tokens = parseConfig(
      config([usdtOnTron, { ...usdtOnTron, id: "eth", chain: "evm" }, btc, xmr]),
    ).tokens;
    expect(tokens.map((token) => token.matching)).toEqual([
      "uniqueAmount",
      "uniqueAmount",
      "uniqueAddress",
      "uniqueAddress",
    ]);
  });

  it("rejects duplicate token ids", () => {
    expect(() => parseConfig(config([usdtOnTron, usdtOnTron]))).toThrow("token ids must be unique");
  });

  it("reserves the Test Token id", () => {
    expect(() => parseConfig(config([{ ...usdtOnTron, id: "test" }]))).toThrow("reserved");
  });

  it("rejects a minimum with more decimals than the token", () => {
    expect(() => parseConfig(config([{ ...usdtOnTron, minimum: "0.0000001" }]))).toThrow(
      "more than 6 decimal places",
    );
  });

  it("rejects a zero minimum", () => {
    expect(() => parseConfig(config([{ ...usdtOnTron, minimum: "0" }]))).toThrow(
      "must be greater than zero",
    );
  });

  it("rejects a numeric minimum", () => {
    expect(() => parseConfig(config([{ ...usdtOnTron, minimum: 1 }]))).toThrow();
  });

  it.each(["0", "0.0000001", "abc"])("rejects tail step %j", (amountTailStep) => {
    expect(() => parseConfig(config([{ ...usdtOnTron, amountTailStep }]))).toThrow();
  });

  it("rejects a unique-amount token without a tail step", () => {
    expect(() => parseConfig(config([{ ...usdtOnTron, amountTailStep: undefined }]))).toThrow();
  });

  it("rejects an unknown chain", () => {
    expect(() => parseConfig(config([{ ...usdtOnTron, chain: "solana" }]))).toThrow();
  });

  it("rejects an xpub on a unique-amount token", () => {
    expect(() => parseConfig(config([{ ...usdtOnTron, xpub: "zpub" }]))).toThrow();
  });

  it("rejects a bitcoin token without an xpub", () => {
    expect(() => parseConfig(config([{ ...btc, xpub: undefined }]))).toThrow();
  });

  it("rejects unknown top-level fields", () => {
    expect(() => parseConfig({ ...config([]), extra: true })).toThrow();
  });

  it.each([0, -1, 1.5])("rejects confirmations %j", (confirmations) => {
    expect(() => parseConfig(config([{ ...usdtOnTron, confirmations }]))).toThrow();
  });
});
