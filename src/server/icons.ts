import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

export function tokenIcon(symbol: string): string | null {
  const name = symbol.toLowerCase();
  if (!/^[a-z0-9]+$/.test(name)) {
    return null;
  }
  try {
    const svg = readFileSync(require.resolve(`cryptocurrency-icons/svg/color/${name}.svg`));
    return `data:image/svg+xml;base64,${svg.toString("base64")}`;
  } catch {
    return null;
  }
}
