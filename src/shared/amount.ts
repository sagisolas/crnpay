const DECIMAL = /^(0|[1-9]\d*)(?:\.(\d+))?$/;

type AmountReadError = "invalid" | "too_many_decimals";

export function readAmount(value: string, decimals: number): bigint | AmountReadError {
  const match = DECIMAL.exec(value);
  if (!match) {
    return "invalid";
  }
  const [, whole = "", fraction = ""] = match;
  if (fraction.length > decimals) {
    return "too_many_decimals";
  }
  return BigInt(whole + fraction.padEnd(decimals, "0"));
}

export function parseAmount(value: string, decimals: number): bigint {
  const amount = readAmount(value, decimals);
  if (amount === "invalid") {
    throw new Error(`Invalid amount "${value}"`);
  }
  if (amount === "too_many_decimals") {
    throw new Error(`Amount "${value}" has more than ${String(decimals)} decimal places`);
  }
  return amount;
}

export function formatAmount(units: bigint, decimals: number): string {
  if (decimals === 0) {
    return units.toString();
  }
  const digits = units.toString().padStart(decimals + 1, "0");
  const whole = digits.slice(0, -decimals);
  const fraction = digits.slice(-decimals).replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole;
}
