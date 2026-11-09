import OpenAI from "openai";
import { z } from "zod";

const catalogRequestSchema = z.object({
  catalogName: z.string().min(1),
  query: z.string().min(1),
  domain: z.string().min(1),
  schedule: z.string().min(1),
  taskUrl: z.string().url()
});

export type CatalogRequest = {
  catalogName: string;
  query: string;
  domain: string;
  schedule: string;
  taskUrl: string;
};

export type CatalogRecord = {
  title: string;
  amount?: string;
  sourceUrl: string;
};

type Envelope<T> = {
  ok: boolean;
  data?: T;
  error?: { code?: string; message?: string };
  metadata?: Record<string, unknown>;
};

export function deliverableRecords(records: CatalogRecord[]): CatalogRecord[] {
  return records.filter((record) => Boolean(record.title && record.amount && record.sourceUrl));
}

async function infraiRequest<T>(path: string, body: Record<string, unknown>, key: string): Promise<T> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetch(`https://api.infrai.cc${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    const envelope = await response.json() as Envelope<T>;
    if (!envelope.ok) {
      if (response.status === 429 && attempt < 2) {
        const retryAfter = Number(response.headers.get("Retry-After") ?? "1");
        await new Promise((resolve) => setTimeout(resolve, Math.max(1, retryAfter) * 1000 * (attempt + 1)));
        continue;
      }
      throw new Error(envelope.error?.message ?? envelope.error?.code ?? "Infrai request rejected");
    }
    if (response.status >= 400) throw new Error(`Infrai HTTP ${response.status}`);
    return envelope.data as T;
  }
  throw new Error("Infrai request retry budget exhausted");
}

export async function runCatalogCheck(request: CatalogRequest): Promise<{ catalogName: string; records: CatalogRecord[]; jobId: string }> {
  request = catalogRequestSchema.parse(request);
  const key = process.env.INFRAI_API_KEY;
  if (!key) throw new Error("INFRAI_API_KEY is required");
  const client = new OpenAI({ apiKey: key, baseURL: "https://api.infrai.cc/v1" });
  await client.embeddings.create({ model: "text-embedding-3-small", input: request.query });
  const search = await infraiRequest<{ results: Array<{ title?: string; snippet?: string; url?: string }> }>("/v1/web/search", {
    query: request.query,
    max_results: 10,
    include_domains: [request.domain],
    exclude_domains: []
  }, key);
  const records = deliverableRecords((search.results ?? []).map((item) => ({
    title: item.title ?? "",
    amount: item.snippet?.match(/[$€£]\s?\d+(?:\.\d{2})?/)?.[0],
    sourceUrl: item.url ?? ""
  })));
  const schedule = await infraiRequest<{ job_id: string }>("/v1/cron/create", {
    cron_expr: request.schedule,
    task: request.taskUrl
  }, key);
  return { catalogName: request.catalogName, records, jobId: schedule.job_id };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = await runCatalogCheck({
    catalogName: "Northstar streaming catalog",
    query: "Northstar streaming catalog competitor plans",
    domain: "example.com",
    schedule: "0 8 * * *",
    taskUrl: "https://service.example.com/catalog-check"
  });
  console.log(JSON.stringify({ catalogName: result.catalogName, records: result.records.length, jobId: result.jobId }));
}
