import { Writable } from "node:stream";
import { createApp } from "../app.js";
import { parseConfig } from "../config.js";
import { createLogger } from "../logger.js";
import { openDatabase } from "../storage.js";

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
  amountTailStep: "0.0001",
};

export const ethOnEthereum = {
  id: "eth",
  symbol: "ETH",
  network: "ethereum",
  networkName: "Ethereum",
  chain: "evm",
  decimals: 18,
  minimum: "0.002",
  confirmations: 12,
  address: "0x7aE3c41F09b5D2e8a6C0f4B19d3E7A52c8F06b1D",
  amountTailStep: "0.000001",
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
  xpub: "zpub6rFR7y4Q2AijBEqTUquhVz398htDFrtymD9xYYfG1m4wAcvPhXNfE3EfH1r1ADqtfSdVCToUG868RvUUkgDKf31mGDtKsAYz2oz2AGutZYs",
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
  options: { tokens?: unknown[]; tailSteps?: number; streamerName?: string } = {},
) {
  const logLines: string[] = [];
  const destination = new Writable({
    write(chunk: Buffer, _encoding, callback) {
      logLines.push(chunk.toString());
      callback();
    },
  });
  const clock = { time: new Date("2026-11-20T12:00:00Z").getTime(), now: () => clock.time };
  const config = parseConfig({
    streamerName: options.streamerName ?? "Matvey",
    tokens: options.tokens ?? [usdtOnTron, ethOnEthereum, btc],
  });
  const app = createApp({
    logger: createLogger("debug", destination),
    config,
    db: openDatabase(":memory:"),
    clock,
    ...(options.tailSteps === undefined ? {} : { tailSteps: options.tailSteps }),
  });

  const advance = (ms: number) => {
    clock.time += ms;
  };
  return { app, advance, logLines };
}

export function postDonation(
  app: ReturnType<typeof setupApp>["app"],
  body: Record<string, unknown>,
) {
  return app.request("/api/donations", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
