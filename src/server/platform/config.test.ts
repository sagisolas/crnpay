import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadConfig, mergeConfig, parseConfig } from "./config.js";
import { btc, ethOnEthereum, usdtOnEthereum, usdtOnTron, xmr } from "../test-support/app.js";

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
    const tokens = parseConfig(config([usdtOnTron, ethOnEthereum, btc, xmr])).tokens;
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

  it("accepts a native EVM token with a chain id and no contract", () => {
    const [eth] = parseConfig(config([ethOnEthereum])).tokens;
    expect(eth).toMatchObject({ chain: "evm", chainId: 1, minimum: 2_000_000_000_000_000n });
    expect(eth).not.toHaveProperty("contract");
  });

  it("accepts an ERC-20 EVM token with a contract address", () => {
    const [erc20] = parseConfig(config([usdtOnEthereum])).tokens;
    expect(erc20).toMatchObject({
      chain: "evm",
      chainId: 1,
      contract: usdtOnEthereum.contract,
    });
  });

  it("rejects an EVM token without a chain id", () => {
    expect(() => parseConfig(config([{ ...ethOnEthereum, chainId: undefined }]))).toThrow();
  });

  it.each(["0x123", "7aE3c41F09b5D2e8a6C0f4B19d3E7A52c8F06b1D", "not-an-address"])(
    "rejects an EVM token whose address is %j",
    (address) => {
      expect(() => parseConfig(config([{ ...ethOnEthereum, address }]))).toThrow();
    },
  );

  it("rejects an EVM token whose contract is not an address", () => {
    expect(() => parseConfig(config([{ ...usdtOnEthereum, contract: "0xdead" }]))).toThrow();
  });

  it("rejects the zero receiving address", () => {
    expect(() =>
      parseConfig(
        config([{ ...ethOnEthereum, address: "0x0000000000000000000000000000000000000000" }]),
      ),
    ).toThrow("zero address");
    expect(() =>
      parseConfig(config([{ ...usdtOnTron, address: "T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb" }])),
    ).toThrow("zero address");
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

describe("mergeConfig", () => {
  const defaults = {
    streamerName: "Your name",
    tokens: [
      {
        id: "eth",
        symbol: "ETH",
        network: "ethereum",
        networkName: "Ethereum",
        chain: "evm",
        chainId: 1,
        decimals: 18,
        minimum: "0.002",
        confirmations: 12,
        amountTailStep: "0.000001",
      },
      {
        id: "usdt-tron",
        symbol: "USDT",
        network: "tron",
        networkName: "Tron",
        chain: "tron",
        decimals: 6,
        minimum: "1",
        confirmations: 20,
        amountTailStep: "0.0001",
      },
    ],
  };

  it("fills a user token's missing fields from the default of the same id", () => {
    const parsed = parseConfig(
      mergeConfig(defaults, {
        streamerName: "Matvey",
        tokens: [{ id: "eth", address: ethOnEthereum.address }],
      }),
    );
    expect(parsed.streamerName).toBe("Matvey");
    expect(parsed.tokens).toHaveLength(1);
    expect(parsed.tokens[0]).toMatchObject({
      id: "eth",
      symbol: "ETH",
      chainId: 1,
      decimals: 18,
      address: ethOnEthereum.address,
    });
  });

  it("lets a user value override the default", () => {
    const parsed = parseConfig(
      mergeConfig(defaults, {
        streamerName: "Matvey",
        tokens: [{ id: "eth", address: ethOnEthereum.address, minimum: "0.05", confirmations: 30 }],
      }),
    );
    expect(parsed.tokens[0]).toMatchObject({ minimum: 50_000_000_000_000_000n, confirmations: 30 });
  });

  it("activates only the tokens the user lists", () => {
    const parsed = parseConfig(
      mergeConfig(defaults, {
        streamerName: "Matvey",
        tokens: [{ id: "usdt-tron", address: usdtOnTron.address }],
      }),
    );
    expect(parsed.tokens.map((token) => token.id)).toEqual(["usdt-tron"]);
  });

  it("falls back to the default streamer name when the user omits it", () => {
    expect(parseConfig(mergeConfig(defaults, { tokens: [] })).streamerName).toBe("Your name");
  });

  it("keeps a user token whose id is not in the defaults", () => {
    const parsed = parseConfig(mergeConfig(defaults, { streamerName: "Matvey", tokens: [btc] }));
    expect(parsed.tokens[0]).toMatchObject({ id: "btc", matching: "uniqueAddress" });
  });
});

describe("loadConfig", () => {
  it("merges a user config over the shipped default catalog", async () => {
    const userPath = join(tmpdir(), `crnpay-config-${String(process.pid)}.json`);
    writeFileSync(
      userPath,
      JSON.stringify({
        streamerName: "Matvey",
        tokens: [{ id: "eth", address: ethOnEthereum.address }],
      }),
    );
    const config = await loadConfig(userPath, "./config.default.json");
    expect(config.streamerName).toBe("Matvey");
    expect(config.tokens).toHaveLength(1);
    expect(config.tokens[0]).toMatchObject({
      id: "eth",
      chainId: 1,
      decimals: 18,
      address: ethOnEthereum.address,
    });
  });

  it("rejects a user Token that does not override the default zero address", async () => {
    const userPath = join(tmpdir(), `crnpay-config-noaddr-${String(process.pid)}.json`);
    writeFileSync(userPath, JSON.stringify({ streamerName: "Matvey", tokens: [{ id: "eth" }] }));
    await expect(loadConfig(userPath, "./config.default.json")).rejects.toThrow("zero address");
  });
});
