import type { Dictionary } from "./locale.js";

type Matching = "uniqueAmount" | "uniqueAddress";

export const PAYMENT_HINTS = {
  uniqueAmount: {
    qrNote: "qrAddressOnly",
    warningTitle: "exactWarningTitle",
    warningBody: "exactWarningBody",
  },
  uniqueAddress: {
    qrNote: null,
    warningTitle: "minimumWarningTitle",
    warningBody: "minimumWarningBody",
  },
} as const satisfies Record<
  Matching,
  { qrNote: keyof Dictionary | null; warningTitle: keyof Dictionary; warningBody: keyof Dictionary }
>;

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
  pay?: PayState | undefined;
}

export interface PaymentInstructions {
  id: string;
  symbol: string;
  networkName: string;
  address: string;
  amount: string;
  declaredAmount: string;
  minimum: string;
  matching: Matching;
  qr: string;
  expiresAt: string;
}

export type DonationStatus =
  | { state: "waiting" | "expired" | "confirmed" }
  | { state: "seen"; confirmations: number; required: number };

export interface PayState {
  instructions: PaymentInstructions;
  status: DonationStatus;
  tokenId: string;
}
