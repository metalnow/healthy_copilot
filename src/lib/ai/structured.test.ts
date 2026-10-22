import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { AiError, chatCompletion, listZdrEndpointParams, transcribe } from "./openrouter";
import { extractJson, generateStructured } from "./structured";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function completion(content: string, cost = 0.001) {
  return jsonResponse({
    model: "test/model",
    choices: [{ message: { content } }],
    usage: { prompt_tokens: 10, completion_tokens: 5, cost },
  });
}

const Schema = z.strictObject({ name: z.string(), kcal: z.number().nullable() });

describe("extractJson", () => {
  it("接受純 JSON、```json 區塊與前後多餘文字", () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 });
    expect(extractJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(extractJson('好的：{"a":1} 以上')).toEqual({ a: 1 });
    expect(() => extractJson("沒有 JSON")).toThrow();
  });
});

describe("chatCompletion", () => {
  it("送出隱私路由設定與 JSON Schema", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(completion('{"name":"x","kcal":null}'));
    await chatCompletion(
      { apiKey: "k", fetch },
      {
        model: "m",
        messages: [{ role: "user", content: "hi" }],
        jsonSchema: { name: "s", schema: { type: "object" } },
      },
    );
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer k");
    const body = JSON.parse(init?.body as string);
    expect(body.provider).toEqual({ zdr: true, data_collection: "deny", require_parameters: true });
    expect(body.response_format).toEqual({
      type: "json_schema",
      json_schema: { name: "s", strict: true, schema: { type: "object" } },
    });
    expect(body).not.toHaveProperty("temperature");
    expect(body).not.toHaveProperty("max_tokens");
  });

  it.each([
    [401, "auth"],
    [402, "insufficient_credits"],
    [429, "rate_limited"],
    [404, "no_endpoint"],
    [502, "provider_error"],
  ])("HTTP %i → %s", async (status, code) => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(jsonResponse({ error: { message: "x" } }, status));
    await expect(
      chatCompletion({ apiKey: "k", fetch }, { model: "m", messages: [] }),
    ).rejects.toMatchObject({ code });
  });

  it("沒有 API key 時不發出請求", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>();
    await expect(chatCompletion({ apiKey: "", fetch }, { model: "m", messages: [] })).rejects.toMatchObject({
      code: "not_configured",
    });
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("generateStructured", () => {
  it("第一次就符合 schema", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(completion('{"name":"便當","kcal":650}'));
    const result = await generateStructured(
      { apiKey: "k", fetch },
      { model: "m", system: "s", user: "u", schema: Schema, schemaName: "food" },
    );
    expect(result.data).toEqual({ name: "便當", kcal: 650 });
    expect(result.attempts).toBe(1);
  });

  it("不符合時把錯誤回饋給模型重試，並累計用量", async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(completion('{"name":"便當"}'))
      .mockResolvedValueOnce(completion('{"name":"便當","kcal":650}'));
    const result = await generateStructured(
      { apiKey: "k", fetch },
      { model: "m", system: "s", user: "u", schema: Schema, schemaName: "food" },
    );
    expect(result.attempts).toBe(2);
    expect(result.usage).toEqual({ promptTokens: 20, completionTokens: 10, cost: 0.002 });
    const retryBody = JSON.parse(fetch.mock.calls[1][1]?.body as string);
    expect(retryBody.messages).toHaveLength(4);
    expect(retryBody.messages[3].content).toContain("kcal");
  });

  it("重試後仍失敗則丟出 invalid_output", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(async () => completion("不是 JSON"));
    const error = await generateStructured(
      { apiKey: "k", fetch },
      { model: "m", system: "s", user: "u", schema: Schema, schemaName: "food" },
    ).catch((e) => e);
    expect(error).toBeInstanceOf(AiError);
    expect(error.code).toBe("invalid_output");
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});

describe("transcribe", () => {
  it("呼叫轉錄端點並回傳文字", async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(jsonResponse({ text: " 喝了一杯拿鐵 ", usage: { seconds: 3.2, cost: 0.0001 } }));
    const result = await transcribe(
      { apiKey: "k", fetch },
      { model: "openai/whisper-large-v3", audioBase64: "AAAA", format: "webm", language: "zh" },
    );
    expect(result).toEqual({ text: "喝了一杯拿鐵", usage: { audioSeconds: 3.2, cost: 0.0001 } });
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe("https://openrouter.ai/api/v1/audio/transcriptions");
    expect(JSON.parse(init?.body as string)).toMatchObject({
      input_audio: { data: "AAAA", format: "webm" },
      language: "zh",
      provider: { zdr: true, data_collection: "deny" },
    });
  });
});

describe("listZdrEndpointParams", () => {
  it("依模型合併各 ZDR 端點支援的參數", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
      jsonResponse({
        data: [
          { model_id: "a/b", supported_parameters: ["max_tokens"] },
          { model_id: "a/b", supported_parameters: ["response_format"] },
          { model_id: "c/d" },
        ],
      }),
    );
    expect(await listZdrEndpointParams({ fetch })).toEqual(
      new Map([
        ["a/b", new Set(["max_tokens", "response_format"])],
        ["c/d", new Set()],
      ]),
    );
  });
});
