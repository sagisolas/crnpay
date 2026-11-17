import { describe, expect, it } from "vitest";
import { parseAmount } from "../shared/amount.js";
import { ethOnEthereum, postDonation, setupApp, usdtOnTron } from "./test-support/app.js";

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const TICK = 15 * 1000;

const donationInput = { tokenId: "usdt-tron", amount: "10", message: "Привет!", nickname: "fox" };

async function donate(app: ReturnType<typeof setupApp>["app"]) {
  const response = await postDonation(app, donationInput);
  const body = (await response.json()) as { id: string; amount: string };
  return { id: body.id, amount: parseAmount(body.amount, usdtOnTron.decimals) };
}

async function statusOf(app: ReturnType<typeof setupApp>["app"], id: string) {
  const response = await app.request(`/api/donations/${id}`);
  return { code: response.status, body: await response.json() };
}

function payment(amount: bigint, confirmations: number, txId = "tx1") {
  return { txId, index: 0, address: usdtOnTron.address, amount, confirmations };
}

describe("Donation lifecycle", () => {
  it("is Waiting until a matching transfer appears, then Payment seen", async () => {
    const { app, advance, chain } = setupApp();
    const donation = await donate(app);
    expect(await statusOf(app, donation.id)).toEqual({ code: 200, body: { state: "waiting" } });

    chain.send("usdt-tron", payment(donation.amount, 1));
    await advance(TICK);

    expect((await statusOf(app, donation.id)).body).toEqual({
      state: "seen",
      confirmations: 1,
      required: 20,
    });
  });

  it("becomes Confirmed when the Payment reaches the Token's confirmation count", async () => {
    const { app, advance, chain } = setupApp();
    const donation = await donate(app);
    chain.send("usdt-tron", payment(donation.amount, 1));
    await advance(TICK);

    chain.send("usdt-tron", payment(donation.amount, 19));
    await advance(TICK);
    expect((await statusOf(app, donation.id)).body).toMatchObject({ confirmations: 19 });

    chain.send("usdt-tron", payment(donation.amount, 20));
    await advance(TICK);
    expect((await statusOf(app, donation.id)).body).toEqual({ state: "confirmed" });
  });

  it("goes straight to Confirmed when the transfer is already final when first seen", async () => {
    const { app, advance, chain } = setupApp();
    const donation = await donate(app);
    chain.send("usdt-tron", payment(donation.amount, 25));
    await advance(TICK);
    expect((await statusOf(app, donation.id)).body).toEqual({ state: "confirmed" });
  });

  it("matches no Donation when the amount is not exact", async () => {
    const { app, advance, chain } = setupApp({ tailSteps: 1 });
    const donation = await donate(app);
    chain.send("usdt-tron", payment(donation.amount + 1n, 20, "more"));
    chain.send("usdt-tron", payment(donation.amount - 1n, 20, "less"));
    chain.send("usdt-tron", payment(parseAmount("10", 6), 20, "no-tail"));
    await advance(TICK);
    expect((await statusOf(app, donation.id)).body).toEqual({ state: "waiting" });
  });

  it("matches no Donation when the transfer goes to another address", async () => {
    const { app, advance, chain } = setupApp();
    const donation = await donate(app);
    chain.send("usdt-tron", { ...payment(donation.amount, 20), address: "TOther" });
    await advance(TICK);
    expect((await statusOf(app, donation.id)).body).toEqual({ state: "waiting" });
  });

  it("does not match a transfer on another Token", async () => {
    const { app, advance, chain } = setupApp();
    const donation = await donate(app);
    chain.send("eth", { ...payment(donation.amount, 20), address: usdtOnTron.address });
    await advance(TICK);
    expect((await statusOf(app, donation.id)).body).toEqual({ state: "waiting" });
  });

  it("counts a transfer reported again only once and ignores a second transfer of the same amount", async () => {
    const { app, advance, chain } = setupApp({ tailSteps: 1 });
    const donation = await donate(app);
    chain.send("usdt-tron", payment(donation.amount, 1, "first"));
    await advance(TICK * 3);
    chain.send("usdt-tron", payment(donation.amount, 20, "second"));
    await advance(TICK);
    expect((await statusOf(app, donation.id)).body).toEqual({
      state: "seen",
      confirmations: 1,
      required: 20,
    });

    chain.send("usdt-tron", payment(donation.amount, 20, "first"));
    await advance(TICK);
    expect((await statusOf(app, donation.id)).body).toEqual({ state: "confirmed" });
  });

  it("tells apart transfers of different Tokens in the same transaction", async () => {
    const usdtOnEthereum = {
      ...ethOnEthereum,
      id: "usdt-eth",
      symbol: "USDT",
      decimals: 6,
      minimum: "1",
      amountTailStep: "0.0001",
    };
    const { app, advance, chain } = setupApp({ tokens: [ethOnEthereum, usdtOnEthereum] });
    const response = await postDonation(app, { ...donationInput, tokenId: "eth", amount: "0.01" });
    const eth = (await response.json()) as { id: string; amount: string };
    const shared = { txId: "0xabc", index: 0, address: ethOnEthereum.address, confirmations: 12 };
    chain.send("usdt-eth", { ...shared, amount: 5n });
    await advance(TICK);
    chain.send("eth", { ...shared, amount: parseAmount(eth.amount, 18) });
    await advance(TICK);
    expect((await statusOf(app, eth.id)).body).toEqual({ state: "confirmed" });
  });

  it("never lets a transfer that matched nothing match a later Donation", async () => {
    const { app, advance, chain } = setupApp({ tailSteps: 1 });
    const early = await donate(app);
    await advance(25 * HOUR);
    chain.send("usdt-tron", payment(early.amount, 1));
    await advance(TICK);

    const later = await donate(app);
    expect(later.amount).toBe(early.amount);
    chain.send("usdt-tron", payment(early.amount, 20));
    await advance(TICK);
    expect((await statusOf(app, later.id)).body).toEqual({ state: "waiting" });
  });

  it("expires a Waiting Donation after 60 minutes", async () => {
    const { app, advance } = setupApp();
    const donation = await donate(app);
    await advance(60 * MINUTE - 1);
    expect((await statusOf(app, donation.id)).body).toEqual({ state: "waiting" });
    await advance(1);
    expect((await statusOf(app, donation.id)).body).toEqual({ state: "expired" });
  });

  it("still matches and Confirms a Payment within 24 hours after expiry", async () => {
    const { app, advance, chain } = setupApp();
    const donation = await donate(app);
    await advance(HOUR + 24 * HOUR - 2 * TICK);
    expect((await statusOf(app, donation.id)).body).toEqual({ state: "expired" });
    chain.send("usdt-tron", payment(donation.amount, 20));
    await advance(TICK);
    expect((await statusOf(app, donation.id)).body).toEqual({ state: "confirmed" });
  });

  it("releases the tail 24 hours after expiry, so a later Payment no longer matches", async () => {
    const { app, advance, chain } = setupApp({ tailSteps: 1 });
    const donation = await donate(app);
    await advance(25 * HOUR);
    chain.send("usdt-tron", payment(donation.amount, 20));
    await advance(TICK);
    expect((await statusOf(app, donation.id)).body).toEqual({ state: "expired" });
    expect((await postDonation(app, donationInput)).status).toBe(201);
  });

  it("keeps Waiting Donations and their state through a restart", async () => {
    const first = setupApp();
    const waiting = await donate(first.app);
    const seen = await donate(first.app);
    first.chain.send("usdt-tron", payment(seen.amount, 1, "seen"));
    await first.advance(TICK);

    const restarted = setupApp({ db: first.db, start: new Date(first.clock.now()).toISOString() });
    expect((await statusOf(restarted.app, seen.id)).body).toMatchObject({ state: "seen" });
    restarted.chain.send("usdt-tron", payment(waiting.amount, 20, "waiting"));
    restarted.chain.send("usdt-tron", payment(seen.amount, 20, "seen"));
    await restarted.advance(TICK);
    expect((await statusOf(restarted.app, waiting.id)).body).toEqual({ state: "confirmed" });
    expect((await statusOf(restarted.app, seen.id)).body).toEqual({ state: "confirmed" });
  });

  it("keeps watching after a provider error and picks the Payment up on the next tick", async () => {
    const { app, advance, chain } = setupApp();
    const donation = await donate(app);
    chain.send("usdt-tron", payment(donation.amount, 20));
    chain.failWith(new Error("provider down"));
    await advance(TICK * 2);
    expect((await statusOf(app, donation.id)).body).toEqual({ state: "waiting" });

    chain.failWith(null);
    await advance(TICK);
    expect((await statusOf(app, donation.id)).body).toEqual({ state: "confirmed" });
  });
});

describe("GET /api/donations/:id", () => {
  it.each(["00000000-0000-4000-8000-000000000000", "not-a-uuid"])(
    "answers 404 for unknown id %s",
    async (id) => {
      const { app } = setupApp();
      expect(await statusOf(app, id)).toEqual({ code: 404, body: { error: "Not found" } });
    },
  );
});
