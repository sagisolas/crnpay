import { createHash } from "node:crypto";
import { ripemd160 } from "@noble/hashes/legacy.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bech32 } from "@scure/base";
import { HDKey } from "@scure/bip32";

const ZPUB_VERSIONS = { public: 0x04b24746, private: 0x04b2430c };
const ACCOUNT_DEPTH = 3;
const RECEIVE_CHAIN = 0;
const MAX_INDEX = 2 ** 31 - 1;

export function parseZpub(zpub: string): HDKey {
  let key: HDKey;
  try {
    key = HDKey.fromExtendedKey(zpub, ZPUB_VERSIONS);
  } catch {
    throw new Error("must be a valid mainnet zpub");
  }
  if (key.privateKey) {
    throw new Error("must be a public zpub, never a private key");
  }
  if (key.depth !== ACCOUNT_DEPTH) {
    throw new Error("must be an account-level zpub (m/84'/0'/account')");
  }
  return key;
}

export function receiveAddress(account: HDKey, index: number): string {
  if (!Number.isInteger(index) || index < 0 || index > MAX_INDEX) {
    throw new Error(`invalid address index ${String(index)}`);
  }
  const { publicKey } = account.deriveChild(RECEIVE_CHAIN).deriveChild(index);
  if (!publicKey) {
    throw new Error("derived key has no public key");
  }
  const program = ripemd160(sha256(publicKey));
  return bech32.encode("bc", [0, ...bech32.toWords(program)]);
}

export function walletFingerprint(zpub: string): string {
  return createHash("sha256").update(zpub).digest("hex").slice(0, 16);
}
