import type { z } from "zod";
import {
  AiError,
  chatCompletion,
  type ChatMessage,
  type ChatUsage,
  type ContentPart,
  type OpenRouterConfig,
} from "./openrouter";
import { STRUCTURED_RETRY_PROMPT } from "./prompts";
import { toResponseSchema } from "./schemas";

/** 從模型輸出取出 JSON：容忍 ```json 區塊或前後多餘文字 */
export function extractJson(content: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(content);
  const candidate = (fenced ? fenced[1] : content).trim();
  try {
    return JSON.parse(candidate);
  } catch {
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(candidate.slice(start, end + 1));
    throw new Error("No JSON object found");
  }
}

function sumUsage(a: ChatUsage, b: ChatUsage): ChatUsage {
  const add = (x?: number, y?: number) => (x === undefined && y === undefined ? undefined : (x ?? 0) + (y ?? 0));
  return {
    promptTokens: add(a.promptTokens, b.promptTokens),
    completionTokens: add(a.completionTokens, b.completionTokens),
    cost: add(a.cost, b.cost),
  };
}

export type StructuredResult<T> = {
  data: T;
  raw: string;
  model: string;
  usage: ChatUsage;
  attempts: number;
};

/**
 * 以 JSON Schema 要求結構化輸出並用 Zod 驗證；不符時把錯誤回饋給模型重試。
 */
export async function generateStructured<T>(
  config: OpenRouterConfig,
  request: {
    model: string;
    temperature?: number | null;
    maxTokens?: number | null;
    system: string;
    user: string | ContentPart[];
    schema: z.ZodType<T>;
    schemaName: string;
    maxRetries?: number;
  },
): Promise<StructuredResult<T>> {
  const messages: ChatMessage[] = [
    { role: "system", content: request.system },
    { role: "user", content: request.user },
  ];
  const jsonSchema = { name: request.schemaName, schema: toResponseSchema(request.schema) };
  const maxAttempts = 1 + (request.maxRetries ?? 1);

  let usage: ChatUsage = {};
  let lastError = "";
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const completion = await chatCompletion(config, {
      model: request.model,
      messages,
      jsonSchema,
      temperature: request.temperature,
      maxTokens: request.maxTokens,
    });
    usage = sumUsage(usage, completion.usage);

    let issues: string;
    try {
      const parsed = request.schema.safeParse(extractJson(completion.content));
      if (parsed.success) {
        return { data: parsed.data, raw: completion.content, model: completion.model, usage, attempts: attempt };
      }
      issues = parsed.error.issues
        .slice(0, 10)
        .map((i) => `- ${i.path.join(".") || "(root)"}: ${i.message}`)
        .join("\n");
    } catch (error) {
      issues = `- 不是合法的 JSON：${error instanceof Error ? error.message : String(error)}`;
    }
    lastError = issues;
    messages.push(
      { role: "assistant", content: completion.content },
      { role: "user", content: STRUCTURED_RETRY_PROMPT(issues) },
    );
  }
  throw new AiError("invalid_output", lastError);
}
