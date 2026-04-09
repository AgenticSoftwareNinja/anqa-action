import type { Logger } from "@agentic-nqa/core";
import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from "@aws-sdk/client-bedrock-runtime";

export interface EmbeddingProvider {
  embed(text: string): Promise<number[]>;
  embedBatch(texts: string[]): Promise<number[][]>;
  readonly dimensions: number;
}

export interface EmbeddingOptions {
  provider: "openai" | "voyage" | "bedrock";
  apiKey: string;
  model?: string;
  awsRegion?: string;
  logger?: Logger;
}

export function createEmbeddingProvider(
  options: EmbeddingOptions,
): EmbeddingProvider {
  if (options.provider === "openai") {
    return new OpenAIEmbeddings(options);
  }
  if (options.provider === "bedrock") {
    return new BedrockEmbeddings(options);
  }
  return new VoyageEmbeddings(options);
}

class OpenAIEmbeddings implements EmbeddingProvider {
  readonly dimensions = 1536;
  private readonly apiKey: string;
  private readonly model: string;
  private readonly logger?: Logger;

  constructor(options: EmbeddingOptions) {
    this.apiKey = options.apiKey;
    this.model = options.model ?? "text-embedding-3-small";
    this.logger = options.logger;
  }

  async embed(text: string): Promise<number[]> {
    const [result] = await this.embedBatch([text]);
    return result;
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    this.logger?.debug("OpenAI embedding batch", { count: texts.length });

    const response = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        input: texts,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`OpenAI embedding failed: ${response.status} ${body}`);
    }

    const data = (await response.json()) as {
      data: Array<{ embedding: number[] }>;
    };
    return data.data.map((d) => d.embedding);
  }
}

class VoyageEmbeddings implements EmbeddingProvider {
  readonly dimensions = 1024;
  private readonly apiKey: string;
  private readonly model: string;
  private readonly logger?: Logger;

  constructor(options: EmbeddingOptions) {
    this.apiKey = options.apiKey;
    this.model = options.model ?? "voyage-code-3";
    this.logger = options.logger;
  }

  async embed(text: string): Promise<number[]> {
    const [result] = await this.embedBatch([text]);
    return result;
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    this.logger?.debug("Voyage embedding batch", { count: texts.length });

    const response = await fetch("https://api.voyageai.com/v1/embeddings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        input: texts,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Voyage embedding failed: ${response.status} ${body}`);
    }

    const data = (await response.json()) as {
      data: Array<{ embedding: number[] }>;
    };
    return data.data.map((d) => d.embedding);
  }
}

class BedrockEmbeddings implements EmbeddingProvider {
  readonly dimensions = 1024;
  private readonly client: BedrockRuntimeClient;
  private readonly model: string;
  private readonly logger?: Logger;

  constructor(options: EmbeddingOptions) {
    this.client = new BedrockRuntimeClient({
      region: options.awsRegion ?? "us-east-1",
    });
    this.model =
      options.model ?? "amazon.titan-embed-text-v2:0";
    this.logger = options.logger;
  }

  async embed(text: string): Promise<number[]> {
    this.logger?.debug("Bedrock embedding", { model: this.model });

    const command = new InvokeModelCommand({
      modelId: this.model,
      contentType: "application/json",
      accept: "application/json",
      body: JSON.stringify({
        inputText: text,
        dimensions: this.dimensions,
      }),
    });

    const response = await this.client.send(command);
    const body = JSON.parse(new TextDecoder().decode(response.body)) as {
      embedding: number[];
    };
    return body.embedding;
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    this.logger?.debug("Bedrock embedding batch", { count: texts.length });
    return Promise.all(texts.map((text) => this.embed(text)));
  }
}
