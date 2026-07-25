import { createHash, randomUUID, sign } from "node:crypto";
import { readFileSync } from "node:fs";

export interface IndubitablyConfig {
  apiBaseUrl: string;
  agentId: string;
  privateKeyPath: string;
}

export class IndubitablyClient {
  private readonly baseUrl: string;
  private readonly agentId: string;
  private readonly privateKeyPem: string;

  constructor(config: IndubitablyConfig) {
    this.baseUrl = config.apiBaseUrl.replace(/\/$/, "");
    this.agentId = config.agentId;
    this.privateKeyPem = readFileSync(config.privateKeyPath, "utf8");
  }

  async request(method: string, path: string, body?: unknown): Promise<unknown> {
    const bodyBytes = body === undefined ? Buffer.alloc(0) : Buffer.from(JSON.stringify(body));
    const timestamp = new Date().toISOString();
    const nonce = randomUUID();
    const bodyHash = createHash("sha256").update(bodyBytes).digest("hex");
    const message = `${method.toUpperCase()}\n${path}\n${timestamp}\n${nonce}\n${bodyHash}`;
    const signature = sign(null, Buffer.from(message), this.privateKeyPem).toString("base64");
    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        "content-type": "application/json",
        "x-indub-agent-id": this.agentId,
        "x-indub-timestamp": timestamp,
        "x-indub-nonce": nonce,
        "x-indub-body-sha256": bodyHash,
        "x-indub-signature": signature,
      },
      body: body === undefined ? undefined : bodyBytes,
    });
    const payload = await response.json() as { data?: unknown; error?: { code?: string; message?: string } };
    if (!response.ok) {
      throw new Error(`${payload.error?.code ?? "INDUBITABLY_REQUEST_FAILED"}: ${payload.error?.message ?? response.statusText}`);
    }
    return payload.data;
  }
}
