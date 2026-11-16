import type { Dictionary } from "./locale.js";

export interface PageToken {
  id: string;
  symbol: string;
  networkName: string;
  decimals: number;
  minimum: string;
}

export interface DonatePageData {
  strings: Dictionary;
  tokens: PageToken[];
}

export interface PaymentInstructions {
  id: string;
  symbol: string;
  networkName: string;
  address: string;
  amount: string;
  qr: string;
  expiresAt: string;
}
