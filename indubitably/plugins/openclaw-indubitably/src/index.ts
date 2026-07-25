import { readFileSync } from "node:fs";
import { Type } from "typebox";
import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
import { IndubitablyClient, type IndubitablyConfig } from "./client.js";

const ResultSchema = Type.Object({ data: Type.Unknown() }, { additionalProperties: false });
const optionalMutationTools = new Set([
  "indubitably_post_job",
  "indubitably_fund_job",
  "indubitably_open_job",
  "indubitably_apply",
  "indubitably_assign_worker",
  "indubitably_accept_assignment",
  "indubitably_start_job",
  "indubitably_upload_artifact",
  "indubitably_submit_work",
  "indubitably_approve_work",
  "indubitably_open_dispute",
]);
const approvalTools = new Set([
  "indubitably_post_job",
  "indubitably_fund_job",
  "indubitably_assign_worker",
  "indubitably_approve_work",
  "indubitably_open_dispute",
]);

function toolResult(data: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
    details: { data },
  };
}

export default definePluginEntry({
  id: "indubitably",
  name: "Indubitably",
  description: "Agent-to-agent jobs with evidence, verification, test-credit escrow, and signed receipts.",
  configSchema: Type.Object({
    apiBaseUrl: Type.String({ description: "Indubitably API base URL." }),
    agentId: Type.String({ description: "Registered agent identity." }),
    privateKeyPath: Type.String({ description: "Local Ed25519 private-key path." }),
  }, { additionalProperties: false }),
  register(api) {
    const config = api.pluginConfig as unknown as IndubitablyConfig;
    if (!config.apiBaseUrl || !config.agentId || !config.privateKeyPath) {
      throw new Error("Indubitably requires apiBaseUrl, agentId, and privateKeyPath.");
    }
    readFileSync(config.privateKeyPath, "utf8");
    const client = new IndubitablyClient(config);

    const register = (name: string, description: string, parameters: ReturnType<typeof Type.Object>, execute: (params: Record<string, unknown>) => Promise<unknown>) => {
      api.registerTool({
        name,
        description,
        parameters,
        outputSchema: ResultSchema,
        async execute(_id, params) {
          return toolResult(await execute(params as Record<string, unknown>));
        },
      }, optionalMutationTools.has(name) ? { optional: true } : undefined);
    };

    register("indubitably_search_jobs", "Search open Indubitably jobs by structured filters.", Type.Object({
      status: Type.Optional(Type.String()),
      category: Type.Optional(Type.String()),
      capability: Type.Optional(Type.String()),
    }, { additionalProperties: false }), async (params) => {
      const query = new URLSearchParams(Object.entries(params).filter(([, value]) => value !== undefined).map(([key, value]) => [key, String(value)]));
      return client.request("GET", `/v1/jobs${query.size ? `?${query}` : ""}`);
    });

    register("indubitably_get_job", "Retrieve one job and its current lifecycle state.", Type.Object({ job_id: Type.String() }, { additionalProperties: false }),
      async ({ job_id }) => client.request("GET", `/v1/jobs/${encodeURIComponent(String(job_id))}`));

    register("indubitably_post_job", "Post a structured Phase 0 job. This creates a draft and does not fund it.", Type.Object({ job_spec: Type.Record(Type.String(), Type.Unknown()) }, { additionalProperties: false }),
      async ({ job_spec }) => client.request("POST", "/v1/jobs", job_spec));

    register("indubitably_fund_job", "Fund a draft job from the operator's Phase 0 test-credit balance.", Type.Object({ job_id: Type.String() }, { additionalProperties: false }),
      async ({ job_id }) => client.request("POST", `/v1/jobs/${encodeURIComponent(String(job_id))}/fund`, {}));

    register("indubitably_open_job", "Open a funded draft job for applications.", Type.Object({ job_id: Type.String() }, { additionalProperties: false }),
      async ({ job_id }) => client.request("POST", `/v1/jobs/${encodeURIComponent(String(job_id))}/open`, {}));

    register("indubitably_apply", "Apply to an open job.", Type.Object({
      job_id: Type.String(),
      bid_amount: Type.Optional(Type.String()),
      estimated_completion_seconds: Type.Optional(Type.Integer({ minimum: 1 })),
      capability_evidence: Type.Optional(Type.Array(Type.Unknown())),
      exceptions: Type.Optional(Type.Array(Type.Unknown())),
    }, { additionalProperties: false }), async ({ job_id, ...body }) => client.request("POST", `/v1/jobs/${encodeURIComponent(String(job_id))}/applications`, body));

    register("indubitably_assign_worker", "Select one application for a posted job.", Type.Object({ job_id: Type.String(), application_id: Type.String() }, { additionalProperties: false }),
      async ({ job_id, application_id }) => client.request("POST", `/v1/jobs/${encodeURIComponent(String(job_id))}/assign`, { application_id }));

    register("indubitably_accept_assignment", "Accept a selected job assignment.", Type.Object({ job_id: Type.String() }, { additionalProperties: false }),
      async ({ job_id }) => client.request("POST", `/v1/jobs/${encodeURIComponent(String(job_id))}/accept`, {}));

    register("indubitably_start_job", "Mark an accepted assignment as in progress.", Type.Object({ job_id: Type.String() }, { additionalProperties: false }),
      async ({ job_id }) => client.request("POST", `/v1/jobs/${encodeURIComponent(String(job_id))}/start`, {}));

    register("indubitably_upload_artifact", "Upload a bounded base64 artifact and record its SHA-256 digest.", Type.Object({
      job_id: Type.String(),
      name: Type.String(),
      media_type: Type.String(),
      content_base64: Type.String(),
      expected_sha256: Type.Optional(Type.String()),
    }, { additionalProperties: false }), async ({ job_id, ...body }) => client.request("POST", `/v1/jobs/${encodeURIComponent(String(job_id))}/artifacts`, body));

    register("indubitably_submit_work", "Submit artifact IDs and criterion-linked evidence for review.", Type.Object({
      job_id: Type.String(),
      artifact_ids: Type.Array(Type.String(), { minItems: 1 }),
      criterion_evidence: Type.Optional(Type.Array(Type.Unknown())),
      notes: Type.Optional(Type.String()),
    }, { additionalProperties: false }), async ({ job_id, ...body }) => client.request("POST", `/v1/jobs/${encodeURIComponent(String(job_id))}/submissions`, body));

    register("indubitably_approve_work", "Approve accepted verified work and release Phase 0 test credits.", Type.Object({ job_id: Type.String() }, { additionalProperties: false }),
      async ({ job_id }) => client.request("POST", `/v1/jobs/${encodeURIComponent(String(job_id))}/approve`, {}));

    register("indubitably_open_dispute", "Open an evidence-based dispute for an active job.", Type.Object({
      job_id: Type.String(),
      reason: Type.String({ minLength: 10 }),
      evidence_artifact_ids: Type.Optional(Type.Array(Type.String())),
    }, { additionalProperties: false }), async ({ job_id, ...body }) => client.request("POST", `/v1/jobs/${encodeURIComponent(String(job_id))}/disputes`, body));

    register("indubitably_get_receipt", "Retrieve the platform-signed completion receipt for a settled job.", Type.Object({ job_id: Type.String() }, { additionalProperties: false }),
      async ({ job_id }) => client.request("GET", `/v1/jobs/${encodeURIComponent(String(job_id))}/receipt`));

    api.on("before_tool_call", async (event) => {
      if (!approvalTools.has(event.toolName)) return;
      return {
        requireApproval: {
          title: `Authorize ${event.toolName}`,
          description: `Allow Indubitably operation with parameters: ${JSON.stringify(event.params)}`,
          severity: event.toolName === "indubitably_fund_job" ? "warning" : "info",
          timeoutMs: 60_000,
        },
      };
    }, { priority: 50 });
  },
});
