import { execFile } from "node:child_process";
import { promisify } from "node:util";
const exec = promisify(execFile);
export class PlaywrightCliDriver {
    bin;
    session;
    logger;
    initialized = false;
    storageStatePath;
    constructor(options = {}) {
        this.bin = options.bin ?? "playwright-cli";
        this.session = options.sessionName ?? `anqa-${Date.now()}`;
        this.logger = options.logger;
    }
    async exec(command, args = []) {
        const fullArgs = ["--session", this.session, command, ...args];
        this.logger?.debug("playwright-cli exec", {
            command,
            args: fullArgs,
        });
        const { stdout } = await exec(this.bin, fullArgs, {
            timeout: 30_000,
        });
        return stdout.trim();
    }
    async setStorageState(path) {
        this.storageStatePath = path;
        this.logger?.debug("Storage state set", { path });
    }
    async launch() {
        if (this.initialized)
            return;
        const args = ["--headless"];
        if (this.storageStatePath) {
            args.push("--storage-state", this.storageStatePath);
        }
        await this.exec("launch", args);
        this.initialized = true;
        this.logger?.info("playwright-cli session started", {
            session: this.session,
        });
    }
    async navigate(url) {
        await this.ensureInitialized();
        const output = await this.exec("navigate", [url]);
        return this.parseSnapshot(output, url);
    }
    async snapshot() {
        await this.ensureInitialized();
        const output = await this.exec("snapshot");
        return this.parseSnapshot(output);
    }
    async click(selector) {
        await this.ensureInitialized();
        await this.exec("click", [selector]);
    }
    async fill(selector, value) {
        await this.ensureInitialized();
        await this.exec("fill", [selector, value]);
    }
    async screenshot(path) {
        await this.ensureInitialized();
        await this.exec("screenshot", ["--output", path]);
    }
    async close() {
        if (!this.initialized)
            return;
        try {
            await this.exec("close");
        }
        catch {
            // Session may already be closed
        }
        this.initialized = false;
        this.logger?.info("playwright-cli session closed", {
            session: this.session,
        });
    }
    async ensureInitialized() {
        if (!this.initialized) {
            await this.launch();
        }
    }
    parseSnapshot(output, url) {
        const elements = [];
        const lines = output.split("\n");
        for (const line of lines) {
            const match = line.match(/\[(\w+)\]\s+(\w+)\s+"([^"]*)"(?:\s+(.+))?/);
            if (match) {
                elements.push({
                    ref: match[1],
                    role: match[2],
                    name: match[3],
                    selector: match[4] ?? match[1],
                });
            }
        }
        return {
            url: url ?? "",
            title: "",
            content: output,
            elements,
            timestamp: Date.now(),
        };
    }
}
//# sourceMappingURL=playwright-cli.js.map