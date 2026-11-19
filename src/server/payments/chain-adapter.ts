import type { Token, UniqueAddressToken } from "../platform/config.js";

export interface IncomingTransfer {
  txId: string;
  index: number;
  address: string;
  amount: bigint;
  confirmations: number;
}

export interface TransferPage {
  transfers: IncomingTransfer[];
  cursor: string | null;
}

// The returned cursor must not pass a transfer below the Token's confirmation count,
// so that transfer is reported again until it is final. Addresses keep the config's spelling.
export interface ChainAdapter {
  incomingTransfers(token: Token, cursor: string | null): Promise<TransferPage>;
}

export interface UniqueAddressAdapter {
  addressAt(token: UniqueAddressToken, index: number): Promise<string>;
  isAddressUsed(token: UniqueAddressToken, address: string): Promise<boolean>;
  incomingTransfers(
    token: UniqueAddressToken,
    addresses: readonly string[],
    cursor: string | null,
  ): Promise<TransferPage>;
}

export interface ChainAdapters {
  evm?: ChainAdapter;
  tron?: ChainAdapter;
  bitcoin?: UniqueAddressAdapter;
  monero?: UniqueAddressAdapter;
}
