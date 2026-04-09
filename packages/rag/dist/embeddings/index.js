import { BedrockRuntimeClient, InvokeModelCommand, } from "@aws-sdk/client-bedrock-runtime";
export function createEmbeddingProvider(options) {
    if (options.provider === "openai") {
        return new OpenAIEmbeddings(options);
    }
    if (options.provider === "bedrock") {
        return new BedrockEmbeddings(options);
    }
    return new VoyageEmbeddings(options);
}
class OpenAIEmbeddings {
    dimensions = 1536;
    apiKey;
    model;
    logger;
    constructor(options) {
        this.apiKey = options.apiKey;
        this.model = options.model ?? "text-embedding-3-small";
        this.logger = options.logger;
    }
    async embed(text) {
        const [result] = await this.embedBatch([text]);
        return result;
    }
    async embedBatch(texts) {
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
        const data = (await response.json());
        return data.data.map((d) => d.embedding);
    }
}
class VoyageEmbeddings {
    dimensions = 1024;
    apiKey;
    model;
    logger;
    constructor(options) {
        this.apiKey = options.apiKey;
        this.model = options.model ?? "voyage-code-3";
        this.logger = options.logger;
    }
    async embed(text) {
        const [result] = await this.embedBatch([text]);
        return result;
    }
    async embedBatch(texts) {
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
        const data = (await response.json());
        return data.data.map((d) => d.embedding);
    }
}
class BedrockEmbeddings {
    dimensions = 1024;
    client;
    model;
    logger;
    constructor(options) {
        this.client = new BedrockRuntimeClient({
            region: options.awsRegion ?? "us-east-1",
        });
        this.model =
            options.model ?? "amazon.titan-embed-text-v2:0";
        this.logger = options.logger;
    }
    async embed(text) {
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
        const body = JSON.parse(new TextDecoder().decode(response.body));
        return body.embedding;
    }
    async embedBatch(texts) {
        this.logger?.debug("Bedrock embedding batch", { count: texts.length });
        return Promise.all(texts.map((text) => this.embed(text)));
    }
}
//# sourceMappingURL=index.js.map