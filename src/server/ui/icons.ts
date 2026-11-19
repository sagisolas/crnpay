import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

const NETWORK_COINS: Readonly<Record<string, string>> = {
  ethereum: "eth",
  tron: "trx",
  bitcoin: "btc",
  monero: "xmr",
  polygon: "matic",
  bsc: "bnb",
};

const toDataUrl = (svg: string | Buffer): string =>
  `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;

function coinIcon(name: string): string | null {
  if (!/^[a-z0-9]+$/.test(name)) {
    return null;
  }
  try {
    return toDataUrl(readFileSync(require.resolve(`cryptocurrency-icons/svg/color/${name}.svg`)));
  } catch {
    return null;
  }
}

const withBadge = (icon: string, badge: string): string =>
  toDataUrl(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">` +
      `<image href="${icon}" width="32" height="32"/>` +
      `<circle cx="25" cy="25" r="7.5" fill="#ffffff"/>` +
      `<image href="${badge}" x="18.5" y="18.5" width="13" height="13"/>` +
      `</svg>`,
  );

export function tokenIcon({ symbol, network }: { symbol: string; network: string }): string | null {
  const name = symbol.toLowerCase();
  const icon = coinIcon(name);
  const networkCoin = NETWORK_COINS[network];
  if (!icon || !networkCoin || networkCoin === name) {
    return icon;
  }
  const badge = coinIcon(networkCoin);
  return badge ? withBadge(icon, badge) : icon;
}
