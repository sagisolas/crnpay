import { describe, expect, it } from "vitest";
import { parseEnv } from "./env.js";

const ALERT_KEY = "a".repeat(64);

describe("parseEnv", () => {
  it("applies defaults", () => {
    expect(parseEnv({ ALERT_KEY })).toEqual({
      PORT: 3000,
      ALERT_KEY,
      CONFIG_PATH: "./config.json",
      DB_PATH: "./data/crnpay.db",
      LOG_LEVEL: "info",
    });
  });

  it("parses the port", () => {
    expect(parseEnv({ ALERT_KEY, PORT: "8080" }).PORT).toBe(8080);
  });

  it.each([undefined, "", "short", "A".repeat(64), "g".repeat(64), "a".repeat(63)])(
    "rejects alert key %j",
    (key) => {
      expect(() => parseEnv({ ALERT_KEY: key })).toThrow();
    },
  );

  it.each(["0", "65536", "3000.5", "abc"])("rejects port %j", (port) => {
    expect(() => parseEnv({ ALERT_KEY, PORT: port })).toThrow();
  });

  it("rejects an unknown log level", () => {
    expect(() => parseEnv({ ALERT_KEY, LOG_LEVEL: "verbose" })).toThrow();
  });
});
