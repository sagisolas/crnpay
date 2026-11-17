import type { Dictionary } from "./locale.js";

export interface PageToken {
  id: string;
  symbol: string;
  networkName: string;
  decimals: number;
  minimum: string;
}

export interface DonatePageData {
  locale: string;
  strings: Dictionary;
  tokens: PageToken[];
  testMode: boolean;
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

export type DonationStatus =
  | { state: "waiting" | "expired" | "confirmed" }
  | { state: "seen"; confirmations: number; required: number };
