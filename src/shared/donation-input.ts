import { readAmount } from "./amount.js";

export const MESSAGE_MAX_LENGTH = 300;
export const NICKNAME_MAX_LENGTH = 32;

const WHITESPACE_CONTROLS = /[\t\n\v\f\r\u0085\u2028\u2029]+/g;
const INVISIBLE_CONTROLS = /[\p{Cc}\u202A-\u202E\u2066-\u2069]/gu;

export interface DonationInput {
  amount: string;
  message: string;
  nickname: string;
}

interface AmountRules {
  decimals: number;
  minimum: bigint;
}

export interface FieldErrors {
  amount?: "invalid" | "too_many_decimals" | "below_minimum";
  message?: "required" | "too_long";
  nickname?: "too_long";
}

interface ValidDonationInput {
  amount: bigint;
  message: string;
  nickname: string | null;
}

type ValidationResult =
  { ok: true; value: ValidDonationInput } | { ok: false; errors: FieldErrors };

export function cleanText(value: string): string {
  return value.replace(WHITESPACE_CONTROLS, " ").replace(INVISIBLE_CONTROLS, "").trim();
}

export function textLength(value: string): number {
  return Array.from(value).length;
}

export function normalizeAmount(value: string): string {
  return value.trim().replace(",", ".");
}

export function validateDonationInput(input: DonationInput, rules: AmountRules): ValidationResult {
  const amount = readAmount(normalizeAmount(input.amount), rules.decimals);
  const message = cleanText(input.message);
  const nickname = cleanText(input.nickname);
  const errors: FieldErrors = {};

  if (typeof amount === "string") {
    errors.amount = amount;
  } else if (amount < rules.minimum) {
    errors.amount = "below_minimum";
  }
  if (!message) {
    errors.message = "required";
  } else if (textLength(message) > MESSAGE_MAX_LENGTH) {
    errors.message = "too_long";
  }
  if (textLength(nickname) > NICKNAME_MAX_LENGTH) {
    errors.nickname = "too_long";
  }

  if (typeof amount === "string" || Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }
  return { ok: true, value: { amount, message, nickname: nickname || null } };
}
