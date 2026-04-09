export type LogLevel = "debug" | "info" | "warn" | "error";

export interface Logger {
  debug(message: string, data?: Record<string, unknown>): void;
  info(message: string, data?: Record<string, unknown>): void;
  warn(message: string, data?: Record<string, unknown>): void;
  error(message: string, data?: Record<string, unknown>): void;
  child(context: Record<string, unknown>): Logger;
}

const levelPriority: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

export function createLogger(
  context: Record<string, unknown> = {},
  minLevel: LogLevel = "info",
): Logger {
  function log(
    level: LogLevel,
    message: string,
    data?: Record<string, unknown>,
  ): void {
    if (levelPriority[level] < levelPriority[minLevel]) return;

    const entry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...context,
      ...data,
    };

    const output = JSON.stringify(entry);

    if (level === "error") {
      process.stderr.write(output + "\n");
    } else {
      process.stdout.write(output + "\n");
    }
  }

  return {
    debug: (msg, data) => log("debug", msg, data),
    info: (msg, data) => log("info", msg, data),
    warn: (msg, data) => log("warn", msg, data),
    error: (msg, data) => log("error", msg, data),
    child(childContext) {
      return createLogger({ ...context, ...childContext }, minLevel);
    },
  };
}
