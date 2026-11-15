import { Writable } from "node:stream";
import { describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { createLogger } from "./logger.js";

function setup() {
  const lines: string[] = [];
  const destination = new Writable({
    write(chunk: Buffer, _encoding, callback) {
      lines.push(chunk.toString());
      callback();
    },
  });
  const app = createApp(createLogger("debug", destination));
  return { app, lines };
}

describe("app", () => {
  it("reports health", async () => {
    const { app } = setup();
    const response = await app.request("/health");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok" });
  });

  it("returns 404 as JSON for unknown routes", async () => {
    const { app } = setup();
    const response = await app.request("/nope");
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Not found" });
  });

  it("sets security headers", async () => {
    const { app } = setup();
    const response = await app.request("/health");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("x-frame-options")).toBe("SAMEORIGIN");
  });

  it("rejects oversized bodies", async () => {
    const { app } = setup();
    const response = await app.request("/health", {
      method: "POST",
      body: "x".repeat(17 * 1024),
      headers: { "content-length": String(17 * 1024) },
    });
    expect(response.status).toBe(413);
  });

  it("never logs the query string", async () => {
    const secret = "f".repeat(64);
    const { app, lines } = setup();
    await app.request(`/alerts?key=${secret}`);
    expect(lines.join("")).toContain('"path":"/alerts"');
    expect(lines.join("")).not.toContain(secret);
  });
});
