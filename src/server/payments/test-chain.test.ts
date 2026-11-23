import { describe, expect, it } from "vitest";
import { ALERT_KEY, postDonation, setupApp } from "../test-support/app.js";

const TICK = 15 * 1000;
const WRONG_KEY = "0".repeat(64);
const testDonation = { tokenId: "test", amount: "1", message: "Проверка", nickname: "Тест" };

async function createTestDonation(app: ReturnType<typeof setupApp>["app"]) {
  const response = await postDonation(app, testDonation, ALERT_KEY);
  expect(response.status).toBe(201);
  return (await response.json()) as { id: string; amount: string; address: string };
}

function sendTestPayment(app: ReturnType<typeof setupApp>["app"], amount: string, key = ALERT_KEY) {
  return app.request(`/api/test-payments?key=${key}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ amount }),
  });
}

async function stateOf(app: ReturnType<typeof setupApp>["app"], id: string) {
  return ((await (await app.request(`/api/donations/${id}`)).json()) as { state: string }).state;
}

describe("Test Token", () => {
  it("is listed on the donation page only with the secret key", async () => {
    const { app } = setupApp();
    const plain = await (await app.request("/")).text();
    const wrong = await (await app.request(`/?key=${WRONG_KEY}`)).text();
    const keyed = await (await app.request(`/?key=${ALERT_KEY}`)).text();

    expect(plain).not.toContain('value="test"');
    expect(wrong).not.toContain('value="test"');
    expect(keyed).toContain('value="test"');
    expect(keyed).toMatch(/TST<em>Test network<\/em>/);
  });

  it.each([[undefined], [WRONG_KEY]])("refuses Test Donations with key %s", async (key) => {
    const { app } = setupApp();
    const response = await postDonation(app, testDonation, key);
    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ error: "unknown_token" });
  });

  it("takes real Token Donations with the key too", async () => {
    const { app } = setupApp();
    const response = await postDonation(
      app,
      { ...testDonation, tokenId: "usdt-tron", amount: "10" },
      ALERT_KEY,
    );
    expect(response.status).toBe(201);
  });

  it("moves a Test Donation to Payment seen, then Confirmed, one confirmation per tick", async () => {
    const { app, advance } = setupApp();
    const donation = await createTestDonation(app);
    expect(donation.address).toBe("test-address");

    expect((await sendTestPayment(app, donation.amount)).status).toBe(202);
    await advance(TICK);
    expect(await stateOf(app, donation.id)).toBe("seen");
    await advance(TICK);
    expect(await stateOf(app, donation.id)).toBe("confirmed");
  });

  it("does not match a test payment of another amount", async () => {
    const { app, advance } = setupApp();
    const donation = await createTestDonation(app);
    expect((await sendTestPayment(app, "1")).status).toBe(202);
    await advance(TICK * 3);
    expect(await stateOf(app, donation.id)).toBe("waiting");
  });

  it.each([[""], [WRONG_KEY]])(
    "hides the test payment endpoint without the key (%j)",
    async (key) => {
      const { app } = setupApp();
      const response = await sendTestPayment(app, "1", key);
      expect(response.status).toBe(404);
    },
  );

  it.each(["abc", "0", "1.0000001", ""])("refuses test payment amount %j", async (amount) => {
    const { app } = setupApp();
    const response = await sendTestPayment(app, amount);
    expect(response.status).toBe(400);
  });

  it("never logs the key", async () => {
    const { app, logLines } = setupApp();
    await app.request(`/?key=${ALERT_KEY}`);
    await sendTestPayment(app, "1");
    expect(logLines.join("")).not.toContain(ALERT_KEY);
  });
});
