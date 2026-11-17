import type { AlertEvent } from "../../shared/alert.js";
import type { setupApp } from "./app.js";

interface SseEvent {
  event: string;
  data: string;
}

const EVENT_TIMEOUT_MS = 1000;

export async function openEventStream(app: ReturnType<typeof setupApp>["app"], path: string) {
  const response = await app.request(path);
  const reader = response.body?.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";

  const readEvent = async (): Promise<SseEvent> => {
    if (!reader) {
      throw new Error("Response has no body");
    }
    for (;;) {
      const end = buffer.indexOf("\n\n");
      if (end >= 0) {
        const raw = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        const lines = raw.split("\n");
        const field = (name: string) =>
          lines
            .filter((line) => line.startsWith(`${name}: `))
            .map((line) => line.slice(name.length + 2));
        const event = field("event")[0];
        if (event) {
          return { event, data: field("data").join("\n") };
        }
        continue;
      }
      const chunk = await reader.read();
      if (chunk.done) {
        throw new Error("Stream ended");
      }
      buffer += chunk.value;
    }
  };

  const next = (): Promise<SseEvent> =>
    Promise.race([
      readEvent(),
      new Promise<never>((_, reject) =>
        setTimeout(() => {
          reject(new Error("No event received"));
        }, EVENT_TIMEOUT_MS),
      ),
    ]);

  const nextAlert = async () => {
    const event = await next();
    if (event.event !== "alert") {
      throw new Error(`Expected alert event, got ${event.event}`);
    }
    return JSON.parse(event.data) as AlertEvent;
  };

  const close = async (): Promise<void> => {
    await reader?.cancel();
  };

  return { response, nextAlert, close };
}
