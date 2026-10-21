import { describe, expect, it } from "vitest";
import { validateModelChoice } from "./model-profiles";
import type { ModelInfo } from "./openrouter";

const models = new Map<string, ModelInfo>([
  ["v/vision", { id: "v/vision", name: "", inputModalities: ["text", "image", "file"], outputModalities: ["text"] }],
  ["i/imgonly", { id: "i/imgonly", name: "", inputModalities: ["text", "image"], outputModalities: ["text"] }],
  ["t/text", { id: "t/text", name: "", inputModalities: ["text"], outputModalities: ["text"] }],
  ["s/stt", { id: "s/stt", name: "", inputModalities: ["audio"], outputModalities: ["transcription"] }],
  ["n/nozdr", { id: "n/nozdr", name: "", inputModalities: ["text"], outputModalities: ["text"] }],
]);
const zdr = new Set(["v/vision", "t/text", "s/stt"]);

describe("validateModelChoice", () => {
  it("接受符合用途且有 ZDR 的模型", () => {
    expect(validateModelChoice("vision", "v/vision", models, zdr)).toBeNull();
    expect(validateModelChoice("fast", "t/text", models, zdr)).toBeNull();
    expect(validateModelChoice("asr", "s/stt", models, zdr)).toBeNull();
  });

  it("拒絕不存在、能力不符或沒有 ZDR 的模型", () => {
    expect(validateModelChoice("fast", "x/unknown", models, zdr)).toContain("找不到");
    expect(validateModelChoice("vision", "t/text", models, zdr)).toContain("圖片");
    expect(validateModelChoice("vision", "i/imgonly", models, zdr)).toContain("PDF");
    expect(validateModelChoice("asr", "t/text", models, zdr)).toContain("語音");
    expect(validateModelChoice("fast", "s/stt", models, zdr)).toContain("文字");
    expect(validateModelChoice("fast", "n/nozdr", models, zdr)).toContain("零資料保留");
  });
});
