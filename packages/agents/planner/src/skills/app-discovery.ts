import type {
  AgentContext,
  BrowserSnapshot,
  Skill,
  TargetApp,
} from "@agentic-nqa/core";

export interface PageInventory {
  pages: PageInfo[];
  navigationGraph: Map<string, string[]>;
}

export interface PageInfo {
  url: string;
  title: string;
  snapshot: BrowserSnapshot;
  links: string[];
  forms: FormInfo[];
  interactiveElements: number;
}

export interface FormInfo {
  action: string;
  fields: string[];
}

export const appDiscoverySkill: Skill = {
  name: "app-discovery",
  description: "Crawl target app and build page inventory",

  async execute(ctx: AgentContext, input: unknown): Promise<PageInventory> {
    const { targetApp, maxDepth } = input as {
      targetApp: TargetApp;
      maxDepth: number;
    };

    const visited = new Set<string>();
    const pages: PageInfo[] = [];
    const navigationGraph = new Map<string, string[]>();
    const queue: Array<{ url: string; depth: number }> = [
      { url: targetApp.url, depth: 0 },
    ];

    // Set up auth if configured
    if (targetApp.auth?.storageStatePath) {
      await ctx.browser.setStorageState(targetApp.auth.storageStatePath);
    }

    while (queue.length > 0) {
      const item = queue.shift()!;
      if (visited.has(item.url) || item.depth > maxDepth) continue;
      visited.add(item.url);

      try {
        const snapshot = await ctx.browser.navigate(item.url);

        const links = extractLinks(snapshot, targetApp.url);
        const forms = extractForms(snapshot);

        const pageInfo: PageInfo = {
          url: item.url,
          title: snapshot.title,
          snapshot,
          links,
          forms,
          interactiveElements: snapshot.elements.filter((e) =>
            ["button", "link", "textbox", "combobox", "checkbox"].includes(
              e.role,
            ),
          ).length,
        };

        pages.push(pageInfo);
        navigationGraph.set(item.url, links);

        for (const link of links) {
          if (!visited.has(link)) {
            queue.push({ url: link, depth: item.depth + 1 });
          }
        }
      } catch (error) {
        ctx.metrics.record("discovery_error", 1, { url: item.url });
      }
    }

    return { pages, navigationGraph };
  },
};

function extractLinks(snapshot: BrowserSnapshot, baseUrl: string): string[] {
  const base = new URL(baseUrl);
  return snapshot.elements
    .filter((e) => e.role === "link")
    .map((e) => {
      try {
        return new URL(e.selector, base).href;
      } catch {
        return null;
      }
    })
    .filter((url): url is string => url !== null && url.startsWith(base.origin));
}

function extractForms(snapshot: BrowserSnapshot): FormInfo[] {
  const formFields = snapshot.elements.filter((e) =>
    ["textbox", "combobox", "checkbox", "radio"].includes(e.role),
  );

  if (formFields.length === 0) return [];

  return [
    {
      action: snapshot.url,
      fields: formFields.map((f) => f.name || f.role),
    },
  ];
}
