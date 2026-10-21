import { describe, expect, it, vi } from "vitest";
import { DriveClient, DriveError } from "./google-drive";

const json = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" }, ...init });

describe("DriveClient", () => {
  it("找到既有資料夾就不重建", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(json({ files: [{ id: "f1", name: "x" }] }));
    expect(await new DriveClient("t", fetch).ensureFolder("Personal Health Copilot")).toBe("f1");
    expect(fetch).toHaveBeenCalledTimes(1);
    const url = new URL(fetch.mock.calls[0][0] as string);
    expect(url.searchParams.get("q")).toBe(
      "name = 'Personal Health Copilot' and mimeType = 'application/vnd.google-apps.folder' and trashed = false",
    );
    expect((fetch.mock.calls[0][1]?.headers as Record<string, string>).Authorization).toBe("Bearer t");
  });

  it("沒有資料夾時建立在指定父資料夾下", async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(json({ files: [] }))
      .mockResolvedValueOnce(json({ id: "new" }));
    expect(await new DriveClient("t", fetch).ensureFolder("backups", "root1")).toBe("new");
    expect(JSON.parse(fetch.mock.calls[1][1]?.body as string)).toEqual({
      name: "backups",
      mimeType: "application/vnd.google-apps.folder",
      parents: ["root1"],
    });
  });

  it("resumable upload：先取得上傳網址再 PUT 內容", async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 200, headers: { Location: "https://upload.example/session" } }))
      .mockResolvedValueOnce(json({ id: "file1", name: "a.hcbackup", size: "3" }));
    const file = await new DriveClient("t", fetch).upload({
      name: "a.hcbackup",
      parentId: "p",
      mimeType: "application/octet-stream",
      bytes: new Uint8Array([1, 2, 3]),
      appProperties: { hcBackup: "1" },
    });
    expect(file.id).toBe("file1");
    expect(fetch.mock.calls[1][0]).toBe("https://upload.example/session");
    expect(fetch.mock.calls[1][1]?.method).toBe("PUT");
  });

  it("錯誤時丟出 DriveError 並帶狀態碼", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(new Response("nope", { status: 401 }));
    await expect(new DriveClient("t", fetch).download("x")).rejects.toMatchObject({ status: 401 });
    await expect(new DriveClient("t", fetch).download("x")).rejects.toBeInstanceOf(DriveError);
  });
});
