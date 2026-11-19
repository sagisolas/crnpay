import type { HDKey } from "@scure/bip32";
import type { Logger } from "pino";
import { z } from "zod";
import type { IncomingTransfer, UniqueAddressAdapter } from "./chain-adapter.js";
import { parseZpub, receiveAddress } from "./bip84.js";
import type { UniqueAddressToken } from "../platform/config.js";

type FetchFn = (url: string) => Promise<Response>;

interface BitcoinAdapterOptions {
  logger?: Logger;
  fetchFn?: FetchFn;
  baseUrl?: string;
}

const DEFAULT_BASE_URL = "https://mempool.space/api";

const sats = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const height = z.number().int().min(0);

const txSchema = z.object({
  txid: z.string().regex(/^[0-9a-f]{64}$/),
  vout: z.array(z.object({ scriptpubkey_address: z.string().optional(), value: sats })),
  status: z.discriminatedUnion("confirmed", [
    z.object({ confirmed: z.literal(true), block_height: height }),
    z.object({ confirmed: z.literal(false) }),
  ]),
});

const txListSchema = z.array(txSchema);

const statsSchema = z.object({ tx_count: z.number().int().min(0) });
const addressSchema = z.object({ chain_stats: statsSchema, mempool_stats: statsSchema });

const tipSchema = z.string().regex(/^\d+$/).transform(Number);

export function createBitcoinAdapter({
  logger,
  fetchFn = (url) => fetch(url),
  baseUrl = DEFAULT_BASE_URL,
}: BitcoinAdapterOptions = {}): UniqueAddressAdapter {
  const accounts = new Map<string, HDKey>();

  const assertBitcoin = (
    token: UniqueAddressToken,
  ): Extract<UniqueAddressToken, { chain: "bitcoin" }> => {
    if (token.chain !== "bitcoin") {
      throw new Error(`bitcoin adapter received a ${token.chain} token`);
    }
    return token;
  };

  const accountOf = (candidate: UniqueAddressToken): HDKey => {
    const token = assertBitcoin(candidate);
    const cached = accounts.get(token.zpub);
    if (cached) {
      return cached;
    }
    const account = parseZpub(token.zpub);
    accounts.set(token.zpub, account);
    return account;
  };

  const get = async (path: string): Promise<Response> => {
    let response: Response;
    try {
      response = await fetchFn(`${baseUrl}${path}`);
    } catch {
      throw new Error("mempool.space request failed");
    }
    if (!response.ok) {
      throw new Error(`mempool.space request failed with status ${String(response.status)}`);
    }
    return response;
  };

  const getJson = async (path: string): Promise<unknown> => {
    const response = await get(path);
    try {
      return await response.json();
    } catch {
      throw new Error("mempool.space returned a malformed response");
    }
  };

  const tipHeight = async (): Promise<number> => {
    const response = await get("/blocks/tip/height");
    return tipSchema.parse((await response.text()).trim());
  };

  const addressAt = (token: UniqueAddressToken, index: number): Promise<string> =>
    Promise.resolve(receiveAddress(accountOf(token), index));

  const isAddressUsed = async (token: UniqueAddressToken, address: string): Promise<boolean> => {
    assertBitcoin(token);
    const stats = addressSchema.parse(await getJson(`/address/${encodeURIComponent(address)}`));
    return stats.chain_stats.tx_count > 0 || stats.mempool_stats.tx_count > 0;
  };

  const incomingTransfers = async (
    token: UniqueAddressToken,
    addresses: readonly string[],
  ): Promise<{ transfers: IncomingTransfer[]; cursor: null }> => {
    assertBitcoin(token);
    if (addresses.length === 0) {
      return { transfers: [], cursor: null };
    }
    const lists: { address: string; txs: z.infer<typeof txListSchema> }[] = [];
    for (const address of addresses) {
      const txs = txListSchema.parse(await getJson(`/address/${encodeURIComponent(address)}/txs`));
      lists.push({ address, txs });
    }
    const tip = await tipHeight();

    const transfers = lists.flatMap(({ address, txs }) =>
      txs.flatMap((tx) => {
        const confirmations = tx.status.confirmed
          ? Math.max(1, tip - tx.status.block_height + 1)
          : 0;
        return tx.vout.flatMap((out, index): IncomingTransfer[] =>
          out.scriptpubkey_address === address && out.value > 0
            ? [{ txId: tx.txid, index, address, amount: BigInt(out.value), confirmations }]
            : [],
        );
      }),
    );
    if (transfers.length > 0) {
      logger?.debug({ tokenId: token.id, count: transfers.length }, "bitcoin transfers listed");
    }
    return { transfers, cursor: null };
  };

  return { addressAt, isAddressUsed, incomingTransfers };
}
