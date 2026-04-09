import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { BrowserSnapshot, SnapshotElement } from "@agentic-nqa/core";
import type { Logger } from "@agentic-nqa/core";

const exec = promisify(execFile);

export interface PlaywrightCliOptions {
  bin?: string;
  sessionName?: string;
  headless?: boolean;
  logger?: Logger;
}

export class PlaywrightCliDriver {
  private readonly bin: string;
  private readonly session: string;
  private readonly logger?: Logger;
  private initialized = false;
  private storageStatePath?: string;

  constructor(options: PlaywrightCliOptions = {}) {
    this.bin = options.bin ?? "playwright-cli";
    this.session = options.sessionName ?? `anqa-${Date.now()}`;
    this.logger = options.logger;
  }

  private async exec(
    command: string,
    args: string[] = [],
  ): Promise<string> {
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

  async setStorageState(path: string): Promise<void> {
    this.storageStatePath = path;
    this.logger?.debug("Storage state set", { path });
  }

  async launch(): Promise<void> {
    if (this.initialized) return;
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

  async navigate(url: string): Promise<BrowserSnapshot> {
    await this.ensureInitialized();
    const output = await this.exec("navigate", [url]);
    return this.parseSnapshot(output, url);
  }

  async snapshot(): Promise<BrowserSnapshot> {
    await this.ensureInitialized();
    const output = await this.exec("snapshot");
    return this.parseSnapshot(output);
  }

  async click(selector: string): Promise<void> {
    await this.ensureInitialized();
    await this.exec("click", [selector]);
  }

  async fill(selector: string, value: string): Promise<void> {
    await this.ensureInitialized();
    await this.exec("fill", [selector, value]);
  }

  async screenshot(path: string): Promise<void> {
    await this.ensureInitialized();
    await this.exec("screenshot", ["--output", path]);
  }

  async close(): Promise<void> {
    if (!this.initialized) return;
    try {
      await this.exec("close");
    } catch {
      // Session may already be closed
    }
    this.initialized = false;
    this.logger?.info("playwright-cli session closed", {
      session: this.session,
    });
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.launch();
    }
  }

  private parseSnapshot(output: string, url?: string): BrowserSnapshot {
    const elements: SnapshotElement[] = [];
    const lines = output.split("\n");

    for (const line of lines) {
      const match = line.match(
        /\[(\w+)\]\s+(\w+)\s+"([^"]*)"(?:\s+(.+))?/,
      );
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
