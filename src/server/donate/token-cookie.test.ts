import { describe, expect, it } from "vitest";
import { postDonation, setupApp } from "../test-support/app.js";

const valid = { tokenId: "btc", amount: "0.001", message: "gm", nickname: "fox" };

describe("remembered Token", () => {
  it("is set by the server when a Donation is created", async () => {
    const { app } = setupApp();
    const response = await postDonation(app, valid);

    expect(response.status).toBe(201);
    const cookie = response.headers.get("set-cookie") ?? "";
    expect(cookie).toMatch(/^token=btc;/);
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/SameSite=Lax/);
    expect(cookie).toMatch(/Path=\//);
  });

  it("is not set when the Donation is refused", async () => {
    const { app } = setupApp();
    const response = await postDonation(app, { ...valid, amount: "0" });

    expect(response.status).toBe(422);
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("preselects the remembered Token on the donation page", async () => {
    const { app } = setupApp();
    const html = await (await app.request("/", { headers: { cookie: "token=btc" } })).text();

    expect(html).toMatch(/value="btc" checked=""/);
    expect(html).not.toMatch(/value="usdt-tron" checked=""/);
    expect(html).toMatch(/id="amount-unit">BTC</);
    expect(html).toContain("Minimum 0.0001 BTC");
    expect(html).toMatch(/data-alert-symbol="true">BTC</);
  });

  it.each(["nope", "test"])("falls back to the first Token for remembered %j", async (id) => {
    const { app } = setupApp();
    const html = await (await app.request("/", { headers: { cookie: `token=${id}` } })).text();

    expect(html).toMatch(/value="usdt-tron" checked=""/);
    expect(html).toMatch(/id="amount-unit">USDT</);
  });
});
