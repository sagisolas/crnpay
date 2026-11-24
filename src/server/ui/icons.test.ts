import { describe, expect, it } from "vitest";
import { tokenIcon } from "./icons.js";

const plainUsdt = tokenIcon({ symbol: "USDT", network: "arbitrum" });
const plainTrx = tokenIcon({ symbol: "TRX", network: "tron" });

const decode = (dataUrl: string | null): string =>
  Buffer.from(dataUrl?.replace("data:image/svg+xml;base64,", "") ?? "", "base64").toString();

describe("tokenIcon", () => {
  it("badges a token with its network's coin in the bottom-right corner", () => {
    const svg = decode(tokenIcon({ symbol: "USDT", network: "tron" }));
    expect(svg).toContain(`href="${String(plainUsdt)}"`);
    expect(svg).toContain(`href="${String(plainTrx)}"`);
  });

  it("keeps the badge inside the icon so it is not cut off", () => {
    const svg = decode(tokenIcon({ symbol: "USDT", network: "tron" }));
    expect(svg).toContain('<circle cx="24.5" cy="24.5" r="7.5"');
    expect(svg).toContain('x="18" y="18" width="13" height="13"');
  });

  it("tells the same token on different networks apart", () => {
    expect(tokenIcon({ symbol: "USDT", network: "tron" })).not.toBe(
      tokenIcon({ symbol: "USDT", network: "ethereum" }),
    );
  });

  it("leaves a network's own coin without a badge", () => {
    const svg = decode(tokenIcon({ symbol: "ETH", network: "ethereum" }));
    expect(svg).toMatch(/^<svg/);
    expect(svg).not.toContain("<image");
  });

  it("leaves the token icon plain when the network has no icon", () => {
    expect(decode(plainUsdt)).not.toContain("<image");
  });

  it("returns null for a token without an icon", () => {
    expect(tokenIcon({ symbol: "NOPE", network: "tron" })).toBeNull();
  });
});
