import QRCode from "qrcode";

export async function qrDataUrl(text: string): Promise<string> {
  const svg = await QRCode.toString(text, {
    type: "svg",
    margin: 0,
    errorCorrectionLevel: "M",
  });
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}
