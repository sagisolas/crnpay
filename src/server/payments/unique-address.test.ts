import { describe, expect, it } from "vitest";
import { ALERT_KEY, btc, postDonation, setupApp } from "../test-support/app.js";
import { openEventStream } from "../test-support/sse.js";
import { tokenIcon } from "../ui/icons.js";
import { qrDataUrl } from "../ui/qr.js";

const TICK = 15 * 1000;
const HOUR = 60 * 60 * 1000;
const MINIMUM = 10_000n;

type Setup = ReturnType<typeof setupApp>;

const address = (index: number) => `btc-address-${String(index)}`;

async function donate(app: Setup["app"], amount = "0.001") {
  const response = await postDonation(app, {
    tokenId: "btc",
    amount,
    message: "gm",
    nickname: "fox",
  });
  return {
    status: response.status,
    body: (await response.json()) as { id: string; address: string; amount: string; qr: string },
  };
}

async function stateOf(app: Setup["app"], id: string) {
  return ((await (await app.request(`/api/donations/${id}`)).json()) as { state: string }).state;
}

function pay(chain: Setup["chain"], to: string, amount: bigint, txId: string, confirmations = 2) {
  chain.send("btc", { txId, index: 0, address: to, amount, confirmations });
}

describe("Bitcoin Donation address", () => {
  it("gives each Donation its own address and a bitcoin: QR with the amount", async () => {
    const { app } = setupApp({ tokens: [btc] });
    const first = await donate(app, "0.001");
    const second = await donate(app, "0.0025");

    expect(first.status).toBe(201);
    expect(first.body).toMatchObject({ address: address(0), amount: "0.001" });
    expect(second.body).toMatchObject({ address: address(1), amount: "0.0025" });
    expect(first.body.qr).toBe(
      await qrDataUrl(
        `bitcoin:${address(0)}?amount=0.001`,
        tokenIcon({ symbol: "BTC", network: "bitcoin" }),
      ),
    );
  });

  it("shows the Donation's own address on its status page", async () => {
    const { app } = setupApp({ tokens: [btc] });
    await donate(app);
    const second = await donate(app);
    const html = await (await app.request(`/d/${second.body.id}`)).text();
    expect(html).toContain(address(1));
    expect(html).not.toContain(address(0));
  });

  it("tells the Donor to send at least the minimum, with no note under the QR", async () => {
    const { app } = setupApp({ tokens: [btc] });
    const donation = await donate(app);
    const html = await (await app.request(`/d/${donation.body.id}`)).text();
    expect(html).toContain("Send at least 0.0001 BTC on Bitcoin.");
    expect(html).toMatch(/<p class="qr-note" id="pay-qr-note" hidden="">\s*<\/p>/);
    expect(html).not.toContain(">Send exactly");
  });

  it("skips an address that already received funds elsewhere", async () => {
    const { app, chain } = setupApp({ tokens: [btc] });
    chain.markUsed(address(0));
    expect((await donate(app)).body.address).toBe(address(1));
  });

  it("refuses the Donation when the provider cannot confirm the address is unused", async () => {
    const { app, chain } = setupApp({ tokens: [btc] });
    chain.failWith(new Error("provider down"));
    const { status, body } = await donate(app);
    expect(status).toBe(503);
    expect(body).toEqual({ error: "token_unavailable" });
  });

  it("refuses new addresses beyond the wallet gap limit until one frees up", async () => {
    const { app, advance } = setupApp({ tokens: [btc] });
    for (let i = 0; i < 20; i++) {
      expect((await donate(app)).status).toBe(201);
    }
    expect((await donate(app)).status).toBe(503);

    await advance(25 * HOUR);
    expect((await donate(app)).body.address).toBe(address(0));
  });

  it("reuses a never-paid address once its Donation is past the 24 h hold", async () => {
    const { app, advance } = setupApp({ tokens: [btc] });
    const expired = await donate(app);
    await advance(HOUR + 24 * HOUR - TICK);
    expect((await donate(app)).body.address).toBe(address(1));

    await advance(TICK);
    expect((await donate(app)).body.address).toBe(expired.body.address);
  });

  it("never reuses an address that received a transfer, even one below the minimum", async () => {
    const { app, advance, chain } = setupApp({ tokens: [btc] });
    const small = await donate(app);
    pay(chain, small.body.address, MINIMUM - 1n, "dust");
    await advance(TICK);
    await advance(25 * HOUR);

    expect((await donate(app)).body.address).toBe(address(1));
  });

  it("never reuses an address paid after its hold ended", async () => {
    const { app, advance, chain } = setupApp({ tokens: [btc] });
    const late = await donate(app);
    await advance(25 * HOUR);
    pay(chain, late.body.address, MINIMUM, "too-late");
    await advance(TICK);

    expect((await app.request(`/api/donations/${late.body.id}`)).status).toBe(404);
    expect((await donate(app)).body.address).toBe(address(1));
  });

  it("forgets a never-paid Donation after its hold and gives its address to the next one", async () => {
    const { app, advance } = setupApp({ tokens: [btc] });
    const unpaid = await donate(app);
    await advance(25 * HOUR - TICK);
    expect(await stateOf(app, unpaid.body.id)).toBe("expired");

    await advance(TICK);
    expect((await app.request(`/api/donations/${unpaid.body.id}`)).status).toBe(404);
    expect((await donate(app)).body.address).toBe(address(0));
  });
});

describe("Bitcoin Payment matching", () => {
  it("Confirms on the first Payment of at least the minimum and alerts the declared amount", async () => {
    const setup = setupApp({ tokens: [btc] });
    const alerts = await openEventStream(setup.app, `/api/alerts/events?key=${ALERT_KEY}`);
    const donation = await donate(setup.app, "0.001");

    pay(setup.chain, donation.body.address, 1_234_567n, "tx1", 1);
    await setup.advance(TICK);
    expect(await stateOf(setup.app, donation.body.id)).toBe("seen");

    pay(setup.chain, donation.body.address, 1_234_567n, "tx1", 2);
    await setup.advance(TICK);
    expect(await stateOf(setup.app, donation.body.id)).toBe("confirmed");
    expect(await alerts.nextAlert()).toMatchObject({ amount: "0.001", symbol: "BTC" });
    await alerts.close();
  });

  it("accepts a Payment smaller than the Donation amount and alerts the amount that arrived", async () => {
    const { app, advance, chain } = setupApp({ tokens: [btc] });
    const alerts = await openEventStream(app, `/api/alerts/events?key=${ALERT_KEY}`);
    const donation = await donate(app, "0.5");
    pay(chain, donation.body.address, MINIMUM, "tx1");
    await advance(TICK);
    expect(await stateOf(app, donation.body.id)).toBe("confirmed");
    expect(await alerts.nextAlert()).toMatchObject({ amount: "0.0001", symbol: "BTC" });
    await alerts.close();
  });

  it("ignores a transfer below the minimum but matches a later one that meets it", async () => {
    const { app, advance, chain } = setupApp({ tokens: [btc] });
    const donation = await donate(app);
    pay(chain, donation.body.address, MINIMUM - 1n, "dust");
    await advance(TICK);
    expect(await stateOf(app, donation.body.id)).toBe("waiting");

    pay(chain, donation.body.address, MINIMUM, "real");
    await advance(TICK);
    expect(await stateOf(app, donation.body.id)).toBe("confirmed");
  });

  it("leads to one Alert only, ignoring later transfers to the same address", async () => {
    const setup = setupApp({ tokens: [btc] });
    const alerts = await openEventStream(setup.app, `/api/alerts/events?key=${ALERT_KEY}`);
    const donation = await donate(setup.app);
    pay(setup.chain, donation.body.address, 20_000n, "first");
    await setup.advance(TICK);
    pay(setup.chain, donation.body.address, 50_000n, "second");
    await setup.advance(TICK * 2);

    expect(await alerts.nextAlert()).toMatchObject({ amount: "0.0002" });
    await expect(alerts.nextAlert()).rejects.toThrow("No event received");
    await alerts.close();
  });

  it("still matches a Payment within 24 hours after expiry", async () => {
    const { app, advance, chain } = setupApp({ tokens: [btc] });
    const donation = await donate(app);
    await advance(HOUR + 24 * HOUR - 2 * TICK);
    pay(chain, donation.body.address, MINIMUM, "late");
    await advance(TICK);
    expect(await stateOf(app, donation.body.id)).toBe("confirmed");
  });

  it("counts a transfer only once it is in a block, so a replaced one cannot claim the Donation", async () => {
    const setup = setupApp({ tokens: [btc] });
    const alerts = await openEventStream(setup.app, `/api/alerts/events?key=${ALERT_KEY}`);
    const donation = await donate(setup.app);
    pay(setup.chain, donation.body.address, 20_000n, "replaced", 0);
    await setup.advance(TICK);
    expect(await stateOf(setup.app, donation.body.id)).toBe("waiting");

    pay(setup.chain, donation.body.address, 30_000n, "replacement", 2);
    await setup.advance(TICK);
    expect(await stateOf(setup.app, donation.body.id)).toBe("confirmed");
    expect(await alerts.nextAlert()).toMatchObject({ amount: "0.0003" });
    await alerts.close();
  });

  it("matches the oldest of several transfers seen in one check", async () => {
    const setup = setupApp({ tokens: [btc] });
    const alerts = await openEventStream(setup.app, `/api/alerts/events?key=${ALERT_KEY}`);
    const donation = await donate(setup.app);
    pay(setup.chain, donation.body.address, 50_000n, "newer", 2);
    pay(setup.chain, donation.body.address, 20_000n, "older", 3);
    await setup.advance(TICK);
    expect(await alerts.nextAlert()).toMatchObject({ amount: "0.0002" });
    await alerts.close();
  });

  it("matches a transfer only to the Donation holding that address", async () => {
    const { app, advance, chain } = setupApp({ tokens: [btc] });
    const first = await donate(app);
    const second = await donate(app);
    pay(chain, second.body.address, MINIMUM, "tx1");
    await advance(TICK);
    expect(await stateOf(app, first.body.id)).toBe("waiting");
    expect(await stateOf(app, second.body.id)).toBe("confirmed");
  });
});
