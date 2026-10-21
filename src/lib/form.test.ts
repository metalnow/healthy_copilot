import { describe, expect, it } from "vitest";
import { fieldErrorsFrom, formNumber, formString, formStrings } from "./form";

describe("form helpers", () => {
  const fd = new FormData();
  fd.set("name", "  拿鐵 ");
  fd.set("empty", "   ");
  fd.set("num", "85.2");
  fd.set("bad", "abc");
  fd.append("times", "08:00");
  fd.append("times", "");
  fd.append("times", "21:00");

  it("字串會去除空白，空值為 undefined", () => {
    expect(formString(fd, "name")).toBe("拿鐵");
    expect(formString(fd, "empty")).toBeUndefined();
    expect(formString(fd, "missing")).toBeUndefined();
  });

  it("數字解析", () => {
    expect(formNumber(fd, "num")).toBe(85.2);
    expect(formNumber(fd, "empty")).toBeUndefined();
    expect(formNumber(fd, "bad")).toBeNaN();
  });

  it("多值欄位略過空值", () => {
    expect(formStrings(fd, "times")).toEqual(["08:00", "21:00"]);
  });

  it("每個欄位只保留第一個錯誤", () => {
    expect(
      fieldErrorsFrom([
        { path: ["weight"], message: "a" },
        { path: ["weight"], message: "b" },
        { path: [], message: "c" },
      ]),
    ).toEqual({ weight: "a", form: "c" });
  });
});
