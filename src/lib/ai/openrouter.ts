// OpenRouter API 用戶端（OpenAI 相容格式）。
// 隱私：每個請求都限定只走 Zero Data Retention、且不收集資料的端點。

export const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
const REQUEST_TIMEOUT_MS = 60_000;

const PRIVACY_PROVIDER_PREFS = { zdr: true, data_collection: "deny" } as const;

export type OpenRouterConfig = {
  apiKey: string;
  baseUrl?: string;
  fetch?: typeof fetch;
};

export type AiErrorCode =
  | "not_configured"
  | "auth"
  | "insufficient_credits"
  | "rate_limited"
  | "no_endpoint"
  | "bad_request"
  | "provider_error"
  | "timeout"
  | "invalid_output";

const ERROR_MESSAGES: Record<AiErrorCode, string> = {
  not_configured: "尚未設定 OpenRouter API Key",
  auth: "OpenRouter API Key 無效",
  insufficient_credits: "OpenRouter 額度不足",
  rate_limited: "AI 請求過於頻繁，請稍後再試",
  no_endpoint: "這個模型目前沒有同時符合隱私設定（零資料保留）與所需功能的服務端點，請稍後再試或到設定更換模型",
  bad_request: "AI 請求格式有誤",
  provider_error: "AI 服務暫時無法使用，請稍後再試",
  timeout: "AI 回應逾時，請稍後再試",
  invalid_output: "AI 回傳的內容無法解析，請再試一次",
};

export class AiError extends Error {
  constructor(
    readonly code: AiErrorCode,
    readonly detail?: string,
  ) {
    super(ERROR_MESSAGES[code]);
    this.name = "AiError";
  }

  /** 給使用者看的訊息（不含供應商細節） */
  get userMessage() {
    return ERROR_MESSAGES[this.code];
  }
}

export type ContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } }
  | { type: "file"; file: { filename: string; file_data: string } };

/** PDF 一律交給模型原生讀取，不轉給第三方 OCR 服務 */
export const NATIVE_PDF_PLUGIN = [{ id: "file-parser", pdf: { engine: "native" } }];

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string | ContentPart[];
};

export type ChatUsage = { promptTokens?: number; completionTokens?: number; cost?: number };

function errorCodeFor(status: number, message: string): AiErrorCode {
  if (status === 401 || status === 403) return "auth";
  if (status === 402) return "insufficient_credits";
  if (status === 429) return "rate_limited";
  if (status === 404 || /no endpoints/i.test(message)) return "no_endpoint";
  if (status === 408) return "timeout";
  if (status === 400 || status === 422) return "bad_request";
  return "provider_error";
}

async function post<T>(config: OpenRouterConfig, path: string, body: unknown): Promise<T> {
  if (!config.apiKey) throw new AiError("not_configured");
  const doFetch = config.fetch ?? fetch;

  let response: Response;
  try {
    response = await doFetch(`${config.baseUrl ?? OPENROUTER_BASE_URL}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
        "X-Title": "Healthy Copilot",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
      throw new AiError("timeout");
    }
    throw new AiError("provider_error", error instanceof Error ? error.message : String(error));
  }

  const text = await response.text();
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    json = undefined;
  }
  const errorMessage =
    (json as { error?: { message?: string } } | undefined)?.error?.message ?? text.slice(0, 500);

  if (!response.ok) throw new AiError(errorCodeFor(response.status, errorMessage), errorMessage);
  if (json === undefined) throw new AiError("provider_error", "Non-JSON response");
  // OpenRouter 有時以 200 回傳 error 物件
  if ((json as { error?: unknown }).error) {
    const code = (json as { error: { code?: number } }).error.code ?? 500;
    throw new AiError(errorCodeFor(code, errorMessage), errorMessage);
  }
  return json as T;
}

type ChatCompletionResponse = {
  model?: string;
  choices?: { message?: { content?: string | null }; finish_reason?: string }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number };
};

export async function chatCompletion(
  config: OpenRouterConfig,
  request: {
    model: string;
    messages: ChatMessage[];
    jsonSchema?: { name: string; schema: Record<string, unknown> };
    maxTokens?: number | null;
    plugins?: unknown[];
  },
): Promise<{ content: string; model: string; usage: ChatUsage }> {
  const response = await post<ChatCompletionResponse>(config, "/chat/completions", {
    model: request.model,
    messages: request.messages,
    ...(request.maxTokens != null && { max_tokens: request.maxTokens }),
    ...(request.plugins && { plugins: request.plugins }),
    ...(request.jsonSchema && {
      response_format: {
        type: "json_schema",
        json_schema: { name: request.jsonSchema.name, strict: true, schema: request.jsonSchema.schema },
      },
    }),
    provider: {
      ...PRIVACY_PROVIDER_PREFS,
      ...(request.jsonSchema && { require_parameters: true }),
    },
  });

  const content = response.choices?.[0]?.message?.content;
  if (typeof content !== "string" || content.trim() === "") {
    throw new AiError("invalid_output", "Empty completion");
  }
  return {
    content,
    model: response.model ?? request.model,
    usage: {
      promptTokens: response.usage?.prompt_tokens,
      completionTokens: response.usage?.completion_tokens,
      cost: response.usage?.cost,
    },
  };
}

type TranscriptionResponse = { text?: string; usage?: { seconds?: number; cost?: number } };

export async function transcribe(
  config: OpenRouterConfig,
  request: { model: string; audioBase64: string; format: string; language?: string },
): Promise<{ text: string; usage: { audioSeconds?: number; cost?: number } }> {
  const response = await post<TranscriptionResponse>(config, "/audio/transcriptions", {
    model: request.model,
    input_audio: { data: request.audioBase64, format: request.format },
    ...(request.language && { language: request.language }),
    provider: PRIVACY_PROVIDER_PREFS,
  });
  if (typeof response.text !== "string") throw new AiError("invalid_output", "No transcription text");
  return {
    text: response.text.trim(),
    usage: { audioSeconds: response.usage?.seconds, cost: response.usage?.cost },
  };
}

export type ModelInfo = {
  id: string;
  name: string;
  inputModalities: string[];
  outputModalities: string[];
};

async function getJson(config: Pick<OpenRouterConfig, "baseUrl" | "fetch">, path: string) {
  const doFetch = config.fetch ?? fetch;
  const response = await doFetch(`${config.baseUrl ?? OPENROUTER_BASE_URL}${path}`, {
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) throw new AiError("provider_error", `GET ${path} ${response.status}`);
  return (await response.json()) as { data?: unknown[] };
}

type RawModel = {
  id: string;
  name?: string;
  architecture?: { input_modalities?: string[]; output_modalities?: string[] };
};

/** 模型清單（含轉錄模型，OpenRouter 預設清單不含 transcription 輸出） */
export async function listModels(config: Pick<OpenRouterConfig, "baseUrl" | "fetch"> = {}) {
  const [chat, stt] = await Promise.all([
    getJson(config, "/models"),
    getJson(config, "/models?output_modalities=transcription"),
  ]);
  const byId = new Map<string, ModelInfo>();
  for (const raw of [...(chat.data ?? []), ...(stt.data ?? [])] as RawModel[]) {
    byId.set(raw.id, {
      id: raw.id,
      name: raw.name ?? raw.id,
      inputModalities: raw.architecture?.input_modalities ?? [],
      outputModalities: raw.architecture?.output_modalities ?? [],
    });
  }
  return byId;
}

/** 具有 Zero Data Retention 端點的模型 id → 這些端點支援的參數（聯集） */
export async function listZdrEndpointParams(config: Pick<OpenRouterConfig, "baseUrl" | "fetch"> = {}) {
  const zdr = await getJson(config, "/endpoints/zdr");
  const byModel = new Map<string, Set<string>>();
  for (const endpoint of (zdr.data ?? []) as { model_id?: string; supported_parameters?: string[] }[]) {
    if (!endpoint.model_id) continue;
    const params = byModel.get(endpoint.model_id) ?? new Set<string>();
    for (const p of endpoint.supported_parameters ?? []) params.add(p);
    byModel.set(endpoint.model_id, params);
  }
  return byModel;
}
