import { createHash, timingSafeEqual } from "node:crypto";

const digest = (value: string): Buffer => createHash("sha256").update(value).digest();

export function keyMatches(given: string | undefined, expected: string): boolean {
  return given !== undefined && timingSafeEqual(digest(given), digest(expected));
}
