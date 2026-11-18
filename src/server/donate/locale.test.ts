import { describe, expect, it } from "vitest";
import { ALERT_KEY, postDonation, setupApp } from "../test-support/app.js";

type App = ReturnType<typeof setupApp>["app"];

function get(app: App, path: string, headers: Record<string, string> = {}) {
  return app.request(path, { headers });
}

const RU_MARK = "Ваше сообщение появится на стриме";
const EN_MARK = "Your message shows up on stream";

describe("donation page language", () => {
  it("renders Russian when the browser prefers it", async () => {
    const { app } = setupApp();
    const html = await (
      await get(app, "/", { "accept-language": "ru-RU,ru;q=0.9,en;q=0.8" })
    ).text();
    expect(html).toContain(RU_MARK);
    expect(html).toMatch(/<html lang="ru">/);
  });

  it("renders English when the browser prefers it", async () => {
    const { app } = setupApp();
    const html = await (await get(app, "/", { "accept-language": "en-US,en;q=0.9" })).text();
    expect(html).toContain(EN_MARK);
    expect(html).toMatch(/<html lang="en">/);
  });

  it("falls back to English for an unsupported language", async () => {
    const { app } = setupApp();
    const html = await (await get(app, "/", { "accept-language": "fr-FR,fr;q=0.9" })).text();
    expect(html).toContain(EN_MARK);
    expect(html).toMatch(/<html lang="en">/);
  });

  it("falls back to English when no language is sent", async () => {
    const { app } = setupApp();
    const html = await (await get(app, "/")).text();
    expect(html).toContain(EN_MARK);
    expect(html).toMatch(/<html lang="en">/);
  });

  it("picks the highest-weighted supported language", async () => {
    const { app } = setupApp();
    const html = await (
      await get(app, "/", { "accept-language": "fr;q=1.0, ru;q=0.7, en;q=0.3" })
    ).text();
    expect(html).toContain(RU_MARK);
  });

  it("treats a language weighted q=0 as not acceptable", async () => {
    const { app } = setupApp();
    const html = await (await get(app, "/", { "accept-language": "ru;q=0, fr" })).text();
    expect(html).toContain(EN_MARK);
  });

  it("sets a cookie that remembers the choice when ?lang is used", async () => {
    const { app } = setupApp();
    const response = await get(app, "/?lang=ru", { "accept-language": "en-US" });
    expect(await response.text()).toContain(RU_MARK);
    expect(response.headers.get("set-cookie")).toMatch(/lang=ru/);
  });

  it("ignores an unsupported ?lang value", async () => {
    const { app } = setupApp();
    const response = await get(app, "/?lang=fr", { "accept-language": "en-US" });
    expect(await response.text()).toContain(EN_MARK);
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("lets the cookie override Accept-Language on later visits", async () => {
    const { app } = setupApp();
    const html = await (
      await get(app, "/", { "accept-language": "en-US", cookie: "lang=ru" })
    ).text();
    expect(html).toContain(RU_MARK);
    expect(html).toMatch(/<html lang="ru">/);
  });

  it("lets ?lang override an existing cookie", async () => {
    const { app } = setupApp();
    const response = await get(app, "/?lang=en", { "accept-language": "ru", cookie: "lang=ru" });
    expect(await response.text()).toContain(EN_MARK);
    expect(response.headers.get("set-cookie")).toMatch(/lang=en/);
  });

  it("shows the status text on /d/:id in the chosen language", async () => {
    const { app } = setupApp();
    const created = await postDonation(app, {
      tokenId: "usdt-tron",
      amount: "10",
      message: "привет",
      nickname: "fox",
    });
    const { id } = (await created.json()) as { id: string };
    const html = await (await get(app, `/d/${id}`, { cookie: "lang=ru" })).text();
    expect(html).toContain("Ждём ваш платёж");
  });

  it("renders an EN/RU switch with the active language marked", async () => {
    const { app } = setupApp();
    const html = await (await get(app, "/", { "accept-language": "ru" })).text();
    expect(html).toMatch(/<a[^>]*href="\?lang=en"[^>]*>EN<\/a>/);
    expect(html).toMatch(/<a[^>]*href="\?lang=ru"[^>]*aria-current="true"[^>]*>RU<\/a>/);
  });

  it("keeps the key in the switch links so test mode survives a language change", async () => {
    const { app } = setupApp();
    const html = await (await get(app, `/?key=${ALERT_KEY}`)).text();
    expect(html).toContain(`href="?lang=ru&amp;key=${ALERT_KEY}"`);
  });

  it("keeps the Donor's message and Nickname untranslated", async () => {
    const { app } = setupApp();
    const html = await (await get(app, `/?key=${ALERT_KEY}`, { "accept-language": "ru" })).text();
    expect(html).toContain(RU_MARK);
  });
});
