import { Writable } from "node:stream";
import { createApp } from "../app.js";
import { parseConfig } from "../platform/config.js";
import { createLogger } from "../platform/logger.js";
import { openDatabase, type Db } from "../platform/storage.js";
import { createFakeChain, createFakeClock, createFakeScheduler } from "./fakes.js";

export const ALERT_KEY = "a1".repeat(32);

export const usdtOnTron = {
  id: "usdt-tron",
  symbol: "USDT",
  network: "tron",
  networkName: "Tron",
  chain: "tron",
  decimals: 6,
  minimum: "1",
  confirmations: 20,
  address: "TQn9Y2khEsLJW1ChVWFMSMeRDow5KcbLSE",
  contract: "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t",
  amountTailStep: "0.0001",
};

export const ethOnEthereum = {
  id: "eth",
  symbol: "ETH",
  network: "ethereum",
  networkName: "Ethereum",
  chain: "evm",
  chainId: 1,
  decimals: 18,
  minimum: "0.002",
  confirmations: 12,
  address: "0x7aE3c41F09b5D2e8a6C0f4B19d3E7A52c8F06b1D",
  amountTailStep: "0.000001",
};

export const usdtOnEthereum = {
  id: "usdt-eth",
  symbol: "USDT",
  network: "ethereum",
  networkName: "Ethereum",
  chain: "evm",
  chainId: 1,
  contract: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
  decimals: 6,
  minimum: "1",
  confirmations: 12,
  address: "0x7aE3c41F09b5D2e8a6C0f4B19d3E7A52c8F06b1D",
  amountTailStep: "0.0001",
};

export const btc = {
  id: "btc",
  symbol: "BTC",
  network: "bitcoin",
  networkName: "Bitcoin",
  chain: "bitcoin",
  decimals: 8,
  minimum: "0.0001",
  confirmations: 2,
  zpub: "zpub6rFR7y4Q2AijBEqTUquhVz398htDFrtymD9xYYfG1m4wAcvPhXNfE3EfH1r1ADqtfSdVCToUG868RvUUkgDKf31mGDtKsAYz2oz2AGutZYs",
};

export const xmr = {
  id: "xmr",
  symbol: "XMR",
  network: "monero",
  networkName: "Monero",
  chain: "monero",
  decimals: 12,
  minimum: "0.01",
  confirmations: 10,
};

export function setupApp(
  options: {
    tokens?: unknown[];
    tailSteps?: number;
    streamerName?: string;
    db?: Db;
    start?: string;
  } = {},
) {
  const logLines: string[] = [];
  const destination = new Writable({
    write(chunk: Buffer, _encoding, callback) {
      logLines.push(chunk.toString());
      callback();
    },
  });
  const clock = createFakeClock(options.start ?? "2026-11-20T12:00:00Z");
  const { scheduler, advance } = createFakeScheduler(clock);
  const chain = createFakeChain();
  const db = options.db ?? openDatabase(":memory:");
  const config = parseConfig({
    streamerName: options.streamerName ?? "Matvey",
    tokens: options.tokens ?? [usdtOnTron, ethOnEthereum, btc],
  });
  const app = createApp({
    logger: createLogger("debug", destination),
    config,
    db,
    clock,
    alertKey: ALERT_KEY,
    scheduler,
    adapters: { evm: chain.adapter, tron: chain.adapter, bitcoin: chain.addressAdapter },
    ...(options.tailSteps === undefined ? {} : { tailSteps: options.tailSteps }),
  });

  return { app, advance, logLines, chain, db, clock };
}

export function postDonation(
  app: ReturnType<typeof setupApp>["app"],
  body: Record<string, unknown>,
  key?: string,
) {
  return app.request(key === undefined ? "/api/donations" : `/api/donations?key=${key}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
