import { describe, expect, it } from "vitest";
import { parseAmount } from "./amount.js";

describe("parseAmount", () => {
  it.each([
    ["25", 6, 25_000_000n],
    ["25.5", 6, 25_500_000n],
    ["0.000001", 6, 1n],
    ["0", 6, 0n],
    ["1", 0, 1n],
    ["0.0005", 18, 500_000_000_000_000n],
  ])("parses %s with %i decimals", (value, decimals, expected) => {
    expect(parseAmount(value, decimals)).toBe(expected);
  });

  it("keeps precision beyond the safe integer range", () => {
    expect(parseAmount("123456789.123456789123456789", 18)).toBe(
      123_456_789_123_456_789_123_456_789n,
    );
  });

  it("rejects more decimal places than the token has", () => {
    expect(() => parseAmount("0.0000001", 6)).toThrow("more than 6 decimal places");
  });

  it.each(["", "-1", "+1", "1e6", " 1", "1 ", "01", "1.", ".5", "1,5", "0x10", "Infinity", "NaN"])(
    "rejects %j",
    (value) => {
      expect(() => parseAmount(value, 6)).toThrow("Invalid amount");
    },
  );
});
