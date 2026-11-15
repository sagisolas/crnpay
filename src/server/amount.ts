const DECIMAL = /^(0|[1-9]\d*)(?:\.(\d+))?$/;

export function parseAmount(value: string, decimals: number): bigint {
  const match = DECIMAL.exec(value);
  if (!match) {
    throw new Error(`Invalid amount "${value}"`);
  }
  const [, whole = "", fraction = ""] = match;
  if (fraction.length > decimals) {
    throw new Error(`Amount "${value}" has more than ${String(decimals)} decimal places`);
  }
  return BigInt(whole + fraction.padEnd(decimals, "0"));
}
