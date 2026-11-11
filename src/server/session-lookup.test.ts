import { describe, expect, it } from "vitest";
import { sessionTokenFromCookie } from "./session-lookup";

describe("sessionTokenFromCookie", () => {
  it("從 Cookie 標頭取出 session token", () => {
    expect(sessionTokenFromCookie("a=1; hc_session=abc%3D; b=2")).toBe("abc=");
    expect(sessionTokenFromCookie("a=1")).toBeNull();
    expect(sessionTokenFromCookie(null)).toBeNull();
  });
});
