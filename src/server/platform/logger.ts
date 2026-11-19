import { pino, type DestinationStream, type Level, type Logger } from "pino";

const REDACTED_PATHS = ["ALERT_KEY", "*.ALERT_KEY", "key", "*.key", "zpub", "*.zpub"];

export function createLogger(level: Level, destination?: DestinationStream): Logger {
  const options = { level, redact: { paths: REDACTED_PATHS, censor: "[redacted]" } };
  return destination ? pino(options, destination) : pino(options);
}
