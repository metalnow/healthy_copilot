// Google Drive REST 用戶端（drive.file 權限：只看得到本 App 建立的檔案）。

const API = "https://www.googleapis.com/drive/v3";
const UPLOAD = "https://www.googleapis.com/upload/drive/v3";
const FOLDER_MIME = "application/vnd.google-apps.folder";

export const DRIVE_ROOT_FOLDER = "Personal Health Copilot";

export type DriveFile = { id: string; name: string; size?: string; createdTime?: string; appProperties?: Record<string, string> };

export class DriveError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "DriveError";
  }
}

export class DriveClient {
  constructor(
    private readonly accessToken: string,
    private readonly doFetch: typeof fetch = fetch,
  ) {}

  private async request(url: string, init: RequestInit = {}) {
    const response = await this.doFetch(url, {
      ...init,
      headers: { Authorization: `Bearer ${this.accessToken}`, ...init.headers },
      signal: AbortSignal.timeout(60_000),
    });
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new DriveError(response.status, `Drive API ${response.status}: ${text.slice(0, 200)}`);
    }
    return response;
  }

  async list(query: string, orderBy = "createdTime desc"): Promise<DriveFile[]> {
    const params = new URLSearchParams({
      q: query,
      orderBy,
      spaces: "drive",
      pageSize: "100",
      fields: "files(id,name,size,createdTime,appProperties)",
    });
    const response = await this.request(`${API}/files?${params}`);
    return ((await response.json()) as { files?: DriveFile[] }).files ?? [];
  }

  /** 找到或建立資料夾 */
  async ensureFolder(name: string, parentId?: string): Promise<string> {
    const escaped = name.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
    const query = [`name = '${escaped}'`, `mimeType = '${FOLDER_MIME}'`, "trashed = false", parentId ? `'${parentId}' in parents` : null]
      .filter(Boolean)
      .join(" and ");
    const [existing] = await this.list(query);
    if (existing) return existing.id;

    const response = await this.request(`${API}/files?fields=id`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, mimeType: FOLDER_MIME, ...(parentId && { parents: [parentId] }) }),
    });
    return ((await response.json()) as { id: string }).id;
  }

  /** Resumable upload：任何大小都適用 */
  async upload(input: {
    name: string;
    parentId: string;
    mimeType: string;
    bytes: Uint8Array;
    appProperties?: Record<string, string>;
  }): Promise<DriveFile> {
    const start = await this.request(`${UPLOAD}/files?uploadType=resumable&fields=id,name,size,createdTime`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=UTF-8",
        "X-Upload-Content-Type": input.mimeType,
        "X-Upload-Content-Length": String(input.bytes.byteLength),
      },
      body: JSON.stringify({ name: input.name, parents: [input.parentId], appProperties: input.appProperties }),
    });
    const location = start.headers.get("Location");
    if (!location) throw new DriveError(500, "Drive did not return an upload URL");
    const response = await this.request(location, {
      method: "PUT",
      headers: { "Content-Type": input.mimeType },
      body: new Uint8Array(input.bytes),
    });
    return (await response.json()) as DriveFile;
  }

  async updateContent(fileId: string, mimeType: string, bytes: Uint8Array) {
    await this.request(`${UPLOAD}/files/${encodeURIComponent(fileId)}?uploadType=media`, {
      method: "PATCH",
      headers: { "Content-Type": mimeType },
      body: new Uint8Array(bytes),
    });
  }

  async download(fileId: string): Promise<Uint8Array> {
    const response = await this.request(`${API}/files/${encodeURIComponent(fileId)}?alt=media`);
    return new Uint8Array(await response.arrayBuffer());
  }

  async delete(fileId: string) {
    await this.request(`${API}/files/${encodeURIComponent(fileId)}`, { method: "DELETE" });
  }
}
