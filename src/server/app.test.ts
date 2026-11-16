import { describe, expect, it } from "vitest";
import { setupApp } from "./test-support/app.js";

describe("app", () => {
  it("reports health", async () => {
    const { app } = setupApp();
    const response = await app.request("/health");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok" });
  });

  it("returns 404 as JSON for unknown routes", async () => {
    const { app } = setupApp();
    const response = await app.request("/nope");
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Not found" });
  });

  it("sets security headers", async () => {
    const { app } = setupApp();
    const response = await app.request("/health");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("x-frame-options")).toBe("SAMEORIGIN");
  });

  it("rejects oversized bodies", async () => {
    const { app } = setupApp();
    const response = await app.request("/health", {
      method: "POST",
      body: "x".repeat(17 * 1024),
      headers: { "content-length": String(17 * 1024) },
    });
    expect(response.status).toBe(413);
  });

  it("never logs the query string", async () => {
    const secret = "f".repeat(64);
    const { app, logLines } = setupApp();
    await app.request(`/alerts?key=${secret}`);
    expect(logLines.join("")).toContain('"path":"/alerts"');
    expect(logLines.join("")).not.toContain(secret);
  });
});
