import { readFile } from "node:fs/promises";
import { z } from "zod";
import { parseAmount } from "../../shared/amount.js";
import { parseZpub, walletFingerprint } from "../payments/bip84.js";

const slug = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "must be lowercase kebab-case");

const evmAddress = z.string().regex(/^0x[0-9a-fA-F]{40}$/, "must be a 0x EVM address");

const ZERO_EVM_ADDRESS = "0x0000000000000000000000000000000000000000";
const ZERO_TRON_ADDRESS = "T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb";

const isZeroAddress = (chain: "evm" | "tron", address: string): boolean =>
  chain === "evm" ? address.toLowerCase() === ZERO_EVM_ADDRESS : address === ZERO_TRON_ADDRESS;

const tokenFields = {
  id: slug,
  symbol: z.string().min(1).max(16),
  network: slug,
  networkName: z.string().trim().min(1).max(32),
  decimals: z.number().int().min(0).max(36),
  minimum: z.string(),
  confirmations: z.number().int().min(1),
};

const uniqueAmountFields = {
  ...tokenFields,
  address: z.string().min(1),
  amountTailStep: z.string(),
};

const tokenSchema = z
  .discriminatedUnion("chain", [
    z.strictObject({
      ...uniqueAmountFields,
      chain: z.literal("evm"),
      address: evmAddress,
      chainId: z.number().int().positive(),
      contract: evmAddress.optional(),
    }),
    z.strictObject({ ...uniqueAmountFields, chain: z.literal("tron") }),
    z.strictObject({ ...tokenFields, chain: z.literal("bitcoin"), zpub: z.string().min(1) }),
    z.strictObject({ ...tokenFields, chain: z.literal("monero") }),
  ])
  .transform((token, ctx) => {
    const toUnits = (field: "minimum" | "amountTailStep", value: string): bigint => {
      try {
        const units = parseAmount(value, token.decimals);
        if (units > 0n) {
          return units;
        }
        ctx.issues.push({
          code: "custom",
          path: [field],
          message: "must be greater than zero",
          input: value,
        });
      } catch (error) {
        ctx.issues.push({
          code: "custom",
          path: [field],
          message: error instanceof Error ? error.message : "invalid amount",
          input: value,
        });
      }
      return 0n;
    };

    const minimum = toUnits("minimum", token.minimum);
    if (token.chain === "evm" || token.chain === "tron") {
      const amountTailStep = toUnits("amountTailStep", token.amountTailStep);
      if (isZeroAddress(token.chain, token.address)) {
        ctx.issues.push({
          code: "custom",
          path: ["address"],
          message: "must be a real receiving address, not the zero address",
          input: token.address,
        });
      }
      return { ...token, minimum, amountTailStep, matching: "uniqueAmount" as const };
    }
    if (token.chain === "bitcoin") {
      try {
        parseZpub(token.zpub);
      } catch (error) {
        ctx.issues.push({
          code: "custom",
          path: ["zpub"],
          message: error instanceof Error ? error.message : "invalid zpub",
          input: "[redacted]",
        });
      }
      return {
        ...token,
        minimum,
        wallet: walletFingerprint(token.zpub),
        matching: "uniqueAddress" as const,
      };
    }
    return { ...token, minimum, wallet: token.id, matching: "uniqueAddress" as const };
  });

const configSchema = z
  .strictObject({
    streamerName: z.string().trim().min(1).max(64),
    tokens: z.array(tokenSchema),
  })
  .refine(({ tokens }) => new Set(tokens.map((token) => token.id)).size === tokens.length, {
    message: "token ids must be unique",
    path: ["tokens"],
  })
  .refine(({ tokens }) => tokens.every((token) => token.id !== "test"), {
    message: 'token id "test" is reserved for the Test Token',
    path: ["tokens"],
  });

export type Config = z.infer<typeof configSchema>;
type ConfigToken = Config["tokens"][number];
type ConfigUniqueAmountToken = Extract<ConfigToken, { matching: "uniqueAmount" }>;
export type TestToken = Omit<ConfigUniqueAmountToken, "chain"> & { chain: "test" };
export type Token = ConfigToken | TestToken;
export type UniqueAmountToken = ConfigUniqueAmountToken | TestToken;
export type UniqueAddressToken = Extract<ConfigToken, { matching: "uniqueAddress" }>;

export function parseConfig(raw: unknown): Config {
  return configSchema.parse(raw);
}

const rawConfigSchema = z.looseObject({
  streamerName: z.unknown().optional(),
  tokens: z.array(z.looseObject({ id: z.string().optional() })).default([]),
});

export function mergeConfig(defaults: unknown, overrides: unknown): unknown {
  const base = rawConfigSchema.parse(defaults);
  const user = rawConfigSchema.parse(overrides);
  const defaultsById = new Map(
    base.tokens.flatMap((token) => (token.id === undefined ? [] : [[token.id, token] as const])),
  );
  const tokens = user.tokens.map((token) => {
    const fallback = token.id === undefined ? undefined : defaultsById.get(token.id);
    return fallback ? { ...fallback, ...token } : token;
  });
  return { streamerName: user.streamerName ?? base.streamerName, tokens };
}

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, "utf8"));
}

export async function loadConfig(path: string, defaultPath: string): Promise<Config> {
  const [defaults, overrides] = await Promise.all([readJson(defaultPath), readJson(path)]);
  return parseConfig(mergeConfig(defaults, overrides));
}
