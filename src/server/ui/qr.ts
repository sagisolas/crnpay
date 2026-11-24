import QRCode from "qrcode";

// Level H survives about 30% of modules lost; the logo with its backing covers under 8% of the area.
const LOGO_SHARE = 0.22;
const BACKING_SHARE = 0.28;

const toDataUrl = (svg: string): string =>
  `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;

function withLogo(svg: string, icon: string): string {
  // eslint-disable-next-line no-restricted-syntax -- QR canvas size, not a token amount
  const size = Number(/viewBox="0 0 (\d+) \d+"/.exec(svg)?.[1]);
  if (!size) {
    return svg;
  }
  const center = size / 2;
  const logoSide = size * LOGO_SHARE;
  const logoOffset = center - logoSide / 2;
  const overlay =
    `<circle cx="${String(center)}" cy="${String(center)}" r="${String((size * BACKING_SHARE) / 2)}" fill="#ffffff"/>` +
    `<image href="${icon}" x="${String(logoOffset)}" y="${String(logoOffset)}" ` +
    `width="${String(logoSide)}" height="${String(logoSide)}"/>`;
  return svg.replace("</svg>", `${overlay}</svg>`);
}

export async function qrDataUrl(text: string, icon: string | null = null): Promise<string> {
  const svg = await QRCode.toString(text, {
    type: "svg",
    margin: 0,
    errorCorrectionLevel: icon ? "H" : "M",
  });
  return toDataUrl(icon ? withLogo(svg, icon) : svg);
}
