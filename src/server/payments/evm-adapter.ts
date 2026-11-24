import type { Logger } from "pino";
import { z } from "zod";
import type { ChainAdapter, IncomingTransfer, TransferPage } from "./chain-adapter.js";
import type { Token, UniqueAmountToken } from "../platform/config.js";

type EvmToken = Extract<UniqueAmountToken, { chain: "evm" }>;

type FetchFn = (url: string) => Promise<Response>;

interface EvmAdapterOptions {
  apiKey: string;
  logger?: Logger;
  fetchFn?: FetchFn;
  baseUrl?: string;
  callsPerSecond?: number;
  wait?: (ms: number) => Promise<void>;
}

const DEFAULT_BASE_URL = "https://api.etherscan.io/v2/api";
const END_BLOCK = "99999999";
// Etherscan's free tier allows 5 req/s but throttles at times; stay under 3/s to be safe.
const DEFAULT_CALLS_PER_SECOND = 1;

const realWait = (ms: number): Promise<void> =>
  ms <= 0 ? Promise.resolve() : new Promise((resolve) => setTimeout(resolve, ms));

const decimal = z.string().regex(/^\d+$/);

const transferRow = z.object({
  blockNumber: decimal.transform(Number),
  hash: z.string().min(1),
  to: z.string(),
  value: decimal,
  isError: z.string().optional(),
  contractAddress: z.string().optional(),
});

type TransferRow = z.infer<typeof transferRow>;

const listResponse = z.object({
  status: z.string(),
  message: z.string(),
  result: z.union([z.array(transferRow), z.string()]),
});

const blockNumberResponse = z.object({
  result: z
    .string()
    .regex(/^0x[0-9a-fA-F]+$/)
    .transform(Number),
});

const sameAddress = (a: string, b: string): boolean => a.toLowerCase() === b.toLowerCase();

export function createEvmAdapter({
  apiKey,
  logger,
  fetchFn = (url) => fetch(url),
  baseUrl = DEFAULT_BASE_URL,
  callsPerSecond = DEFAULT_CALLS_PER_SECOND,
  wait = realWait,
}: EvmAdapterOptions): ChainAdapter {
  const minIntervalMs = 1000 / callsPerSecond;
  let nextSlotAt = 0;
  // One gate shared by every EVM Token on this adapter: the api key's rate limit is account-wide.
  const throttle = async (): Promise<void> => {
    const now = Date.now();
    const startAt = Math.max(now, nextSlotAt);
    nextSlotAt = startAt + minIntervalMs;
    await wait(startAt - now);
  };

  const query = (chainId: number, params: Record<string, string>): string => {
    const url = new URL(baseUrl);
    url.searchParams.set("chainid", String(chainId));
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
    url.searchParams.set("apikey", apiKey);
    return url.toString();
  };

  const getJson = async (url: string): Promise<unknown> => {
    await throttle();
    let response: Response;
    try {
      response = await fetchFn(url);
    } catch {
      throw new Error("etherscan request failed");
    }
    if (!response.ok) {
      throw new Error(`etherscan request failed with status ${String(response.status)}`);
    }
    try {
      return await response.json();
    } catch {
      throw new Error("etherscan returned a malformed response");
    }
  };

  const currentBlock = async (chainId: number): Promise<number> => {
    const body = blockNumberResponse.parse(
      await getJson(query(chainId, { module: "proxy", action: "eth_blockNumber" })),
    );
    return body.result;
  };

  const list = async (
    token: EvmToken,
    action: string,
    startBlock: string,
  ): Promise<TransferRow[]> => {
    const params: Record<string, string> = {
      module: "account",
      action,
      address: token.address,
      startblock: startBlock,
      endblock: END_BLOCK,
      sort: "asc",
    };
    if (token.contract) {
      params["contractaddress"] = token.contract;
    }
    const body = listResponse.parse(await getJson(query(token.chainId, params)));
    if (typeof body.result === "string") {
      logger?.warn(
        { tokenId: token.id, action, message: body.result },
        "etherscan refused request",
      );
      throw new Error(`etherscan ${action} refused: ${body.result}`);
    }
    return body.result;
  };

  const incomingTransfers = async (token: Token, cursor: string | null): Promise<TransferPage> => {
    if (token.chain !== "evm") {
      throw new Error(`evm adapter received a ${token.chain} token`);
    }
    const startBlock = cursor ?? "0";
    const nativeRows = async (): Promise<TransferRow[]> => {
      const [external, internal] = await Promise.all([
        list(token, "txlist", startBlock),
        list(token, "txlistinternal", startBlock),
      ]);
      return [...external, ...internal];
    };
    const [tip, rows] = await Promise.all([
      currentBlock(token.chainId),
      token.contract ? list(token, "tokentx", startBlock) : nativeRows(),
    ]);

    const seen = new Map<string, number>();
    const transfers: IncomingTransfer[] = [];
    for (const row of rows) {
      if (!sameAddress(row.to, token.address)) {
        continue;
      }
      if (row.isError === "1") {
        continue;
      }
      if (
        token.contract &&
        !(row.contractAddress && sameAddress(row.contractAddress, token.contract))
      ) {
        continue;
      }
      const amount = BigInt(row.value);
      if (amount <= 0n) {
        continue;
      }
      const index = seen.get(row.hash) ?? 0;
      seen.set(row.hash, index + 1);
      transfers.push({
        txId: row.hash,
        index,
        address: token.address,
        amount,
        confirmations: Math.max(0, tip - row.blockNumber + 1),
      });
    }

    if (transfers.length > 0) {
      logger?.info(
        { tokenId: token.id, chainId: token.chainId, count: transfers.length },
        "evm incoming transfers detected",
      );
    }

    const finalBefore = Math.max(0, tip - token.confirmations + 1);
    return { transfers, cursor: String(finalBefore) };
  };

  return { incomingTransfers };
}
