const levelPriority = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
};
export function createLogger(context = {}, minLevel = "info") {
    function log(level, message, data) {
        if (levelPriority[level] < levelPriority[minLevel])
            return;
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
        }
        else {
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
//# sourceMappingURL=index.js.map