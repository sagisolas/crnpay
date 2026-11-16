import { describe, expect, it } from "vitest";
import { postDonation, setupApp, usdtOnTron } from "./test-support/app.js";

const valid = {
  tokenId: "usdt-tron",
  amount: "10",
  message: "Привет из Казани!",
  nickname: "kazan_fox",
};

interface Instructions {
  id: string;
  address: string;
  amount: string;
  symbol: string;
  networkName: string;
  qr: string;
  expiresAt: string;
}

describe("POST /api/donations", () => {
  it("returns Payment instructions with the shared address and a unique exact amount", async () => {
    const { app } = setupApp();
    const response = await postDonation(app, valid);
    expect(response.status).toBe(201);
    const body = (await response.json()) as Instructions;
    expect(body).toMatchObject({
      address: usdtOnTron.address,
      symbol: "USDT",
      networkName: "Tron",
      expiresAt: "2026-11-20T13:00:00.000Z",
    });
    expect(body.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(body.amount).toMatch(/^10\.\d{1,4}$/);
    expect(body.amount).not.toBe("10");
    expect(body.qr).toMatch(/^data:image\/svg\+xml;base64,/);
  });

  it.each([
    [{ amount: "abc" }, { amount: "invalid" }],
    [{ amount: "" }, { amount: "invalid" }],
    [{ amount: "1.0000001" }, { amount: "too_many_decimals" }],
    [{ amount: "0.99" }, { amount: "below_minimum" }],
    [{ message: "" }, { message: "required" }],
    [{ message: " \u0007\u202E " }, { message: "required" }],
    [{ message: "я".repeat(301) }, { message: "too_long" }],
    [{ nickname: "n".repeat(33) }, { nickname: "too_long" }],
  ])("refuses %j with %j", async (change, fields) => {
    const { app } = setupApp();
    const response = await postDonation(app, { ...valid, ...change });
    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ error: "validation", fields });
  });

  it("accepts limits measured in characters, a comma as decimal point, and no nickname", async () => {
    const { app } = setupApp({ tailSteps: 1 });
    const response = await postDonation(app, {
      tokenId: "usdt-tron",
      amount: " 1,5 ",
      message: "🎙".repeat(300),
    });
    expect(response.status).toBe(201);
    expect(((await response.json()) as Instructions).amount).toBe("1.5001");
  });

  it.each(["btc", "nope"])("refuses Token %j that cannot take Donations", async (tokenId) => {
    const { app } = setupApp();
    const response = await postDonation(app, { ...valid, tokenId });
    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ error: "unknown_token" });
  });

  it.each([
    ["not json"],
    [JSON.stringify({ amount: "1" })],
    [JSON.stringify({ ...valid, amount: 10 })],
  ])("refuses malformed body %s", async (body) => {
    const { app } = setupApp();
    const response = await app.request("/api/donations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_request" });
  });

  describe("amount tails", () => {
    const HOUR = 60 * 60 * 1000;
    const amountOf = async (response: Response) => ((await response.json()) as Instructions).amount;

    it("gives every held Donation of a Token its own exact amount, then refuses", async () => {
      const { app } = setupApp({ tailSteps: 3 });
      const amounts = [];
      for (let i = 0; i < 3; i++) {
        amounts.push(await amountOf(await postDonation(app, valid)));
      }
      expect(amounts.sort()).toEqual(["10.0001", "10.0002", "10.0003"]);

      const refused = await postDonation(app, valid);
      expect(refused.status).toBe(503);
      expect(await refused.json()).toEqual({ error: "token_unavailable" });
    });

    it("keeps an expired Donation's amount for 24 hours, then frees it", async () => {
      const { app, advance } = setupApp({ tailSteps: 1 });
      expect(await amountOf(await postDonation(app, valid))).toBe("10.0001");

      advance(HOUR + 23 * HOUR);
      expect((await postDonation(app, valid)).status).toBe(503);

      advance(HOUR);
      expect(await amountOf(await postDonation(app, valid))).toBe("10.0001");
    });

    it("never reuses an amount held by a Donation with a different requested amount", async () => {
      const { app } = setupApp({ tailSteps: 2 });
      const first = await amountOf(await postDonation(app, { ...valid, amount: "10.0001" }));
      expect(first).toMatch(/^10\.000[23]$/);

      const second = await amountOf(await postDonation(app, valid));
      expect(second).toMatch(/^10\.000[12]$/);
      expect(second).not.toBe(first);
      expect((await postDonation(app, valid)).status).toBe(first === "10.0002" ? 503 : 201);
    });

    it("holds tails per Token", async () => {
      const { app } = setupApp({ tailSteps: 1 });
      expect((await postDonation(app, valid)).status).toBe(201);
      const eth = await postDonation(app, { ...valid, tokenId: "eth", amount: "0.01" });
      expect(await amountOf(eth)).toBe("0.010001");
    });
  });
});
