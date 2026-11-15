import { Writable } from "node:stream";
import { describe, expect, it } from "vitest";
import { createLogger } from "./logger.js";

describe("createLogger", () => {
  it("redacts secrets", () => {
    const lines: string[] = [];
    const destination = new Writable({
      write(chunk: Buffer, _encoding, callback) {
        lines.push(chunk.toString());
        callback();
      },
    });
    const logger = createLogger("info", destination);
    logger.info({ ALERT_KEY: "secret-1", env: { ALERT_KEY: "secret-2" }, token: { xpub: "secret-3" } });
    const output = lines.join("");
    expect(output).not.toMatch(/secret-\d/);
    expect(output).toContain("[redacted]");
  });
});
