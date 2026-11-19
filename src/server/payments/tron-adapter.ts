import type { Logger } from "pino";
import { z } from "zod";
import type { ChainAdapter, IncomingTransfer, TransferPage } from "./chain-adapter.js";
import type { Token } from "../platform/config.js";

type FetchFn = (url: string, init?: RequestInit) => Promise<Response>;

interface TronAdapterOptions {
  apiKey: string;
  logger?: Logger;
  fetchFn?: FetchFn;
  baseUrl?: string;
}

const DEFAULT_BASE_URL = "https://api.trongrid.io";

const timestampCursor = z.string().regex(/^\d+$/);

const blockResponse = z.object({
  block_header: z.object({
    raw_data: z.object({
      number: z.number().int().nonnegative(),
      timestamp: z.number().int().nonnegative(),
    }),
  }),
});

const trc20Row = z.object({
  transaction_id: z.string().regex(/^[0-9a-fA-F]+$/),
  token_info: z.object({ address: z.string() }),
  block_timestamp: z.number().int().nonnegative(),
  to: z.string(),
  type: z.string(),
  value: z.string().regex(/^\d+$/),
});

const trc20Response = z.object({
  success: z.literal(true),
  data: z.array(trc20Row),
  meta: z.object({ fingerprint: z.string().min(1).optional() }),
});

const txInfoResponse = z.union([
  z.object({
    blockNumber: z.number().int().nonnegative(),
    receipt: z.object({ result: z.string().optional() }).optional(),
  }),
  z.strictObject({}),
]);

export function createTronAdapter({
  apiKey,
  logger,
  fetchFn = (url, init) => fetch(url, init),
  baseUrl = DEFAULT_BASE_URL,
}: TronAdapterOptions): ChainAdapter {
  const request = async (path: string, init: RequestInit = {}): Promise<unknown> => {
    let response: Response;
    try {
      response = await fetchFn(new URL(path, baseUrl).toString(), {
        ...init,
        headers: { "content-type": "application/json", "TRON-PRO-API-KEY": apiKey },
      });
    } catch {
      throw new Error("trongrid request failed");
    }
    if (!response.ok) {
      throw new Error(`trongrid request failed with status ${String(response.status)}`);
    }
    try {
      return await response.json();
    } catch {
      throw new Error("trongrid returned a malformed response");
    }
  };

  const post = (path: string, body: Record<string, unknown>): Promise<unknown> =>
    request(path, { method: "POST", body: JSON.stringify(body) });

  const block = async (number?: number) => {
    const body =
      number === undefined ? { detail: false } : { id_or_num: String(number), detail: false };
    return blockResponse.parse(await post("/wallet/getblock", body)).block_header.raw_data;
  };

  const transactionInfo = async (txId: string) =>
    txInfoResponse.parse(await post("/wallet/gettransactioninfobyid", { value: txId }));

  const listTransfers = async (address: string, contract: string, minTimestamp: string) => {
    const rows: z.infer<typeof trc20Row>[] = [];
    let fingerprint: string | undefined;
    do {
      const params = new URLSearchParams({
        only_to: "true",
        contract_address: contract,
        min_timestamp: minTimestamp,
        order_by: "block_timestamp,asc",
        limit: "200",
      });
      if (fingerprint) {
        params.set("fingerprint", fingerprint);
      }
      const body = trc20Response.parse(
        await request(`/v1/accounts/${address}/transactions/trc20?${params.toString()}`),
      );
      rows.push(...body.data);
      fingerprint = body.meta.fingerprint;
    } while (fingerprint);
    return rows;
  };

  const incomingTransfers = async (token: Token, cursor: string | null): Promise<TransferPage> => {
    if (token.chain !== "tron") {
      throw new Error(`tron adapter received a ${token.chain} token`);
    }
    const tip = await block();
    const boundary = await block(Math.max(0, tip.number - token.confirmations + 1));
    const minTimestamp =
      cursor === null ? String(boundary.timestamp) : timestampCursor.parse(cursor);
    const rows = await listTransfers(token.address, token.contract, minTimestamp);

    const seen = new Map<string, number>();
    const transfers: IncomingTransfer[] = [];
    let nextCursor = boundary.timestamp;
    for (const row of rows) {
      if (row.to !== token.address || row.token_info.address !== token.contract) {
        continue;
      }
      if (row.type !== "Transfer") {
        continue;
      }
      const amount = BigInt(row.value);
      if (amount <= 0n) {
        continue;
      }
      const index = seen.get(row.transaction_id) ?? 0;
      seen.set(row.transaction_id, index + 1);
      const info = await transactionInfo(row.transaction_id);
      if (!("blockNumber" in info)) {
        nextCursor = Math.min(nextCursor, row.block_timestamp);
        continue;
      }
      if (info.receipt?.result !== "SUCCESS") {
        logger?.warn(
          { tokenId: token.id, txId: row.transaction_id, result: info.receipt?.result },
          "tron transfer ignored: transaction did not succeed",
        );
        continue;
      }
      transfers.push({
        txId: row.transaction_id,
        index,
        address: token.address,
        amount,
        confirmations: Math.max(0, tip.number - info.blockNumber + 1),
      });
    }

    if (transfers.length > 0) {
      logger?.info(
        { tokenId: token.id, count: transfers.length },
        "tron incoming transfers detected",
      );
    }

    return { transfers, cursor: String(nextCursor) };
  };

  return { incomingTransfers };
}
