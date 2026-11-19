import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { parseAmount } from "../../shared/amount.js";
import {
  ALERT_KEY,
  btc,
  ethOnEthereum,
  postDonation,
  setupApp,
  usdtOnTron,
} from "../test-support/app.js";

const TICK = 15 * 1000;
const input = { tokenId: "usdt-tron", amount: "10", message: "hi", nickname: "fox" };

type App = ReturnType<typeof setupApp>["app"];

async function create(app: App, body: Record<string, unknown> = input, key?: string) {
  const response = await postDonation(app, body, key);
  return (await response.json()) as { id: string; amount: string };
}

function pageData(html: string): { pay?: Record<string, unknown> } {
  const json = /<script type="application\/json" id="page-data">(.*?)<\/script>/s.exec(html)?.[1];
  return JSON.parse(json ?? "null") as { pay?: Record<string, unknown> };
}

describe("GET /d/:id", () => {
  it("renders the payment instructions for an existing Donation", async () => {
    const { app } = setupApp();
    const { id, amount } = await create(app);
    const response = await app.request(`/d/${id}`);
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    expect(html).toContain(usdtOnTron.address);
    expect(html).toContain(amount);
    expect(html).toMatch(/id="form-panel"[^>]*hidden/);
    expect(html).not.toMatch(/id="pay-panel"[^>]*hidden/);
  });

  it("previews the Alert with the Donation's own Token, not the first listed", async () => {
    const { app } = setupApp({ tokens: [ethOnEthereum, btc] });
    const { id } = await create(app, { ...input, tokenId: "btc", amount: "0.001" });
    const html = await (await app.request(`/d/${id}`)).text();

    const preview = /<aside class="stage".*<\/aside>/s.exec(html)?.[0] ?? "";
    expect(preview).toMatch(/data-alert-amount="true">0\.001</);
    expect(preview).toMatch(/data-alert-symbol="true">BTC</);
  });

  it("explains a QR code that carries the address only", async () => {
    const { app } = setupApp();
    const { id } = await create(app);
    const html = await (await app.request(`/d/${id}`)).text();

    expect(html).toContain(
      "The code holds the address only, you will need to enter the amount yourself.",
    );
  });

  it("embeds the Donation's instructions and status in the page data", async () => {
    const { app } = setupApp();
    const { id } = await create(app);
    const data = pageData(await (await app.request(`/d/${id}`)).text());

    expect(data.pay).toMatchObject({
      tokenId: "usdt-tron",
      status: { state: "waiting" },
      instructions: { id, symbol: "USDT", networkName: "Tron", address: usdtOnTron.address },
    });
  });

  it("shows the confirmed status once the Payment is final", async () => {
    const { app, advance, chain } = setupApp();
    const { id, amount } = await create(app);
    chain.send("usdt-tron", {
      txId: "tx1",
      index: 0,
      address: usdtOnTron.address,
      amount: parseAmount(amount, usdtOnTron.decimals),
      confirmations: 20,
    });
    await advance(TICK);

    const html = await (await app.request(`/d/${id}`)).text();
    expect(pageData(html).pay).toMatchObject({ status: { state: "confirmed" } });
    expect(html).toContain('data-state="confirmed"');
  });

  it("is Not Found for an unknown or malformed id", async () => {
    const { app } = setupApp();
    expect((await app.request(`/d/${randomUUID()}`)).status).toBe(404);
    expect((await app.request("/d/not-a-uuid")).status).toBe(404);
  });

  it("serves a Test Donation only with the key", async () => {
    const { app } = setupApp();
    const { id } = await create(app, { ...input, tokenId: "test" }, ALERT_KEY);
    expect((await app.request(`/d/${id}`)).status).toBe(404);

    const response = await app.request(`/d/${id}?key=${ALERT_KEY}`);
    const html = await response.text();
    expect(response.status).toBe(200);
    expect(pageData(html).pay).toMatchObject({ tokenId: "test" });
    expect(html).not.toMatch(/id="test-panel"[^>]*hidden/);
  });
});
