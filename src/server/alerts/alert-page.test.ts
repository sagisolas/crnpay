import { describe, expect, it } from "vitest";
import { parseAmount } from "../../shared/amount.js";
import { ALERT_KEY, postDonation, setupApp, usdtOnTron } from "../test-support/app.js";
import { openEventStream } from "../test-support/sse.js";

const WRONG_KEY = "0".repeat(64);
const TICK = 15 * 1000;
const MINUTE = 60 * 1000;

type App = ReturnType<typeof setupApp>;

async function payDonation(
  { app, chain, advance }: App,
  input: { message: string; nickname?: string },
  confirmations: number[] = [usdtOnTron.confirmations],
) {
  const response = await postDonation(app, { tokenId: "usdt-tron", amount: "10", ...input });
  const { amount } = (await response.json()) as { amount: string };
  for (const count of confirmations) {
    chain.send("usdt-tron", {
      txId: `tx-${input.message}`,
      index: 0,
      address: usdtOnTron.address,
      amount: parseAmount(amount, usdtOnTron.decimals),
      confirmations: count,
    });
    await advance(TICK);
  }
  return amount;
}

const confirmDonation = (setup: App, input: { message: string; nickname?: string }) =>
  payDonation(setup, input);

const openAlerts = (app: App["app"]) => openEventStream(app, `/api/alerts/events?key=${ALERT_KEY}`);

describe("Alert key", () => {
  it.each([
    ["GET", "/alerts"],
    ["GET", "/alerts?test"],
    ["GET", "/api/alerts/events"],
    ["POST", "/api/alerts/00000000-0000-4000-8000-000000000000/shown"],
  ])("%s %s answers 404 without the right key", async (method, path) => {
    const { app } = setupApp();
    const separator = path.includes("?") ? "&" : "?";
    const missing = await app.request(path, { method });
    const wrong = await app.request(`${path}${separator}key=${WRONG_KEY}`, { method });
    expect(missing.status).toBe(404);
    expect(wrong.status).toBe(404);
  });

  it("serves the Alert page with the right key", async () => {
    const { app } = setupApp();
    const response = await app.request(`/alerts?key=${ALERT_KEY}`);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
  });
});

describe("Alert event stream", () => {
  it("delivers an Alert live when a Donation is Confirmed", async () => {
    const setup = setupApp();
    const page = await openAlerts(setup.app);
    expect(page.response.headers.get("content-type")).toContain("text/event-stream");

    const paid = await confirmDonation(setup, { message: "Привет <b>!</b>", nickname: "fox" });

    expect(paid).not.toBe("10");
    expect(await page.nextAlert()).toMatchObject({
      nickname: "fox",
      amount: "10",
      symbol: "USDT",
      message: "Привет <b>!</b>",
    });
    await page.close();
  });

  it("sends no Nickname for an anonymous Donation", async () => {
    const setup = setupApp();
    const page = await openAlerts(setup.app);
    await confirmDonation(setup, { message: "hi" });
    expect((await page.nextAlert()).nickname).toBeNull();
    await page.close();
  });

  it("shows nothing before a Donation is Confirmed", async () => {
    const setup = setupApp();
    const page = await openAlerts(setup.app);
    await payDonation(setup, { message: "pending" }, [1]);
    await confirmDonation(setup, { message: "final" });

    expect((await page.nextAlert()).message).toBe("final");
    await page.close();
  });
});

const markShown = (app: App["app"], id: string, key = ALERT_KEY) =>
  app.request(`/api/alerts/${id}/shown?key=${key}`, { method: "POST" });

describe("Alert replay and acknowledgement", () => {
  it("replays unshown Alerts on connect, oldest first", async () => {
    const setup = setupApp();
    await confirmDonation(setup, { message: "first" });
    await confirmDonation(setup, { message: "second" });

    const page = await openAlerts(setup.app);
    expect((await page.nextAlert()).message).toBe("first");
    expect((await page.nextAlert()).message).toBe("second");
    await page.close();
  });

  it("does not send an Alert again once a page has shown it", async () => {
    const setup = setupApp();
    const first = await openAlerts(setup.app);
    await confirmDonation(setup, { message: "shown" });
    const alert = await first.nextAlert();
    expect((await markShown(setup.app, alert.id)).status).toBe(204);
    await first.close();

    const reopened = await openAlerts(setup.app);
    await confirmDonation(setup, { message: "later" });
    expect((await reopened.nextAlert()).message).toBe("later");
    await reopened.close();
  });

  it("replays an Alert that was delivered but never shown", async () => {
    const setup = setupApp();
    const first = await openAlerts(setup.app);
    await confirmDonation(setup, { message: "missed" });
    await first.nextAlert();
    await first.close();

    const reopened = await openAlerts(setup.app);
    expect((await reopened.nextAlert()).message).toBe("missed");
    await reopened.close();
  });

  it("never shows Alerts Confirmed more than 1 hour ago", async () => {
    const setup = setupApp();
    await confirmDonation(setup, { message: "stale" });
    await setup.advance(59 * MINUTE);
    await confirmDonation(setup, { message: "recent" });
    await setup.advance(2 * MINUTE);

    const page = await openAlerts(setup.app);
    expect((await page.nextAlert()).message).toBe("recent");
    await confirmDonation(setup, { message: "live" });
    expect((await page.nextAlert()).message).toBe("live");
    await page.close();
  });

  it("delivers to two pages at once, and a shown Alert is replayed to neither", async () => {
    const setup = setupApp();
    const obsPage = await openAlerts(setup.app);
    const browser = await openAlerts(setup.app);
    await confirmDonation(setup, { message: "both" });

    const alert = await obsPage.nextAlert();
    expect((await browser.nextAlert()).id).toBe(alert.id);
    await markShown(setup.app, alert.id);
    await markShown(setup.app, alert.id);
    await obsPage.close();
    await browser.close();

    const third = await openAlerts(setup.app);
    await confirmDonation(setup, { message: "next" });
    expect((await third.nextAlert()).message).toBe("next");
    await third.close();
  });

  it("creates one Alert per Donation even when more confirmations arrive", async () => {
    const setup = setupApp();
    await payDonation(setup, { message: "once" }, [20, 25]);

    const page = await openAlerts(setup.app);
    expect((await page.nextAlert()).message).toBe("once");
    await confirmDonation(setup, { message: "other" });
    expect((await page.nextAlert()).message).toBe("other");
    await page.close();
  });

  it("answers 404 for an unknown Alert", async () => {
    const { app } = setupApp();
    expect((await markShown(app, "not-a-uuid")).status).toBe(404);
  });
});

describe("Test Alert", () => {
  it("shows a sample Alert on the Alert page opened with test", async () => {
    const { app } = setupApp();
    const response = await app.request(`/alerts?key=${ALERT_KEY}&test`);
    expect(response.status).toBe(200);
    expect(await response.text()).toContain('"message":"Test Alert"');
  });

  it("shows no sample on the plain Alert page", async () => {
    const { app } = setupApp();
    const response = await app.request(`/alerts?key=${ALERT_KEY}`);
    expect(await response.text()).not.toContain("Test Alert");
  });

  it("creates no Donation, so no Alert is sent for it", async () => {
    const setup = setupApp();
    await setup.app.request(`/alerts?key=${ALERT_KEY}&test`);

    const page = await openAlerts(setup.app);
    await confirmDonation(setup, { message: "real" });
    expect((await page.nextAlert()).message).toBe("real");
    await page.close();
  });
});
