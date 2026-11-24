import { describe, expect, it } from "vitest";
import { btc, ethOnEthereum, setupApp, usdtOnTron, xmr } from "../test-support/app.js";

async function page(options: Parameters<typeof setupApp>[0] = {}) {
  const { app } = setupApp(options);
  const response = await app.request("/");
  return { response, html: await response.text() };
}

describe("GET /", () => {
  it("shows the Streamer's name", async () => {
    const { response, html } = await page();
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    expect(html).toMatch(/<h1[^>]*>Matvey<\/h1>/);
  });

  it("lists Tokens that can take Donations with asset, network and minimum", async () => {
    const { html } = await page({ tokens: [usdtOnTron, ethOnEthereum, btc, xmr] });
    expect(html).toContain('value="usdt-tron"');
    expect(html).toContain('value="eth"');
    expect(html).toMatch(/USDT<em>Tron<\/em>/);
    expect(html).toMatch(/ETH<em>Ethereum<\/em>/);
    expect(html).toContain("Minimum 1 USDT");
    expect(html).toContain('value="btc"');
    expect(html).not.toContain('value="xmr"');
  });

  it("shows the Token logo when one exists", async () => {
    const unknown = { ...usdtOnTron, id: "zzz", symbol: "ZZZNOPE" };
    const { html } = await page({ tokens: [usdtOnTron, unknown] });
    const chips = /<div class="chips">.*?<\/fieldset>/s.exec(html)?.[0] ?? "";
    expect(chips.match(/<img[^>]+src="data:image\/svg\+xml;base64,/g)).toHaveLength(1);
  });

  it("shows the selected Token logo in the Alert preview", async () => {
    const { html } = await page({ tokens: [usdtOnTron] });
    expect(html).toMatch(/<img class="alert-icon" src="data:image\/svg\+xml;base64,[^"]+" alt=""/);
  });

  it("gives the page script the Token rules", async () => {
    const { html } = await page({ tokens: [ethOnEthereum] });
    const json = /<script type="application\/json" id="page-data">(.*?)<\/script>/s.exec(html)?.[1];
    expect(JSON.parse(json ?? "null")).toMatchObject({
      tokens: [
        { id: "eth", symbol: "ETH", networkName: "Ethereum", decimals: 18, minimum: "0.002" },
      ],
    });
  });

  it("escapes config text in markup and in page data", async () => {
    const evil = "</script><script>alert(1)</script>";
    const { html } = await page({
      tokens: [{ ...usdtOnTron, networkName: "<b>Tron</b>" }],
      streamerName: evil,
    });
    expect(html).not.toContain("<script>alert(1)");
    expect(html).not.toContain("<b>Tron</b>");
  });
});
