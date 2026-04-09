export type LogLevel = "debug" | "info" | "warn" | "error";
export interface Logger {
    debug(message: string, data?: Record<string, unknown>): void;
    info(message: string, data?: Record<string, unknown>): void;
    warn(message: string, data?: Record<string, unknown>): void;
    error(message: string, data?: Record<string, unknown>): void;
    child(context: Record<string, unknown>): Logger;
}
export declare function createLogger(context?: Record<string, unknown>, minLevel?: LogLevel): Logger;
//# sourceMappingURL=index.d.ts.map