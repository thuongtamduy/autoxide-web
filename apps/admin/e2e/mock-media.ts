// Thư viện media (module `media`) cho core giả. Hình dạng theo `openapi.json` (`satisfies` kiểu của
// SDK). Tải lên nhận nguyên tệp làm thân request như core: kiểm loại thật theo vài byte đầu (PNG,
// JPEG), giới hạn 2 MB (core thật mặc định 100 MB); tệp mới ở chế độ riêng tư. Nội dung tệp
// (`GET /api/v1/media/{id}/content`) công khai thì khách tải được, riêng tư thì cần đăng nhập.
import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { json, problem, type Schemas, send, text } from "./mock-http.ts";

type Item = Schemas["MediaItemResponse"] & { bytes: Buffer; version: number };

const LIMIT = 2 * 1024 * 1024;
let items: Item[] = [];
let folders: Schemas["FolderResponse"][] = [];
let clock = Date.parse("2026-11-15T01:00:00Z");

function now(): string {
  clock += 1000;
  return new Date(clock).toISOString();
}

export function resetMedia() {
  items = [];
  folders = [];
  clock = Date.parse("2026-11-15T01:00:00Z");
}

function view(item: Item): Schemas["MediaItemResponse"] {
  const { bytes: _bytes, version: _version, ...rest } = item;
  return rest;
}

/** Người tải lên trong core giả (`include=uploader` trả tên qua sổ đối tượng, D-267 mục 4). */
const UPLOADER = { id: "01a1dd85-0000-7000-8000-00000000a001", name: "admin" };

/** Ảnh thiếu alt như core (D-267 mục 1): ảnh, `alt` mặc định trống, không trang trí. */
function missingAlt(item: Item): boolean {
  return item.content_type.startsWith("image/") && item.alt.trim() === "" && !item.decorative;
}

/** Ảnh công khai như bản xem trước của `content` trả (`PublicMedia`); tệp riêng tư thì `null`. */
export function publicMediaOf(id: string): Schemas["PublicMedia"] | null {
  const item = items.find((i) => i.id === id);
  if (!item || item.trashed_at || item.visibility !== "public") return null;
  return {
    id: item.id,
    url: item.url,
    alt: item.alt,
    width: item.width ?? null,
    height: item.height ?? null,
    variants: [],
  };
}

function sendItem(response: ServerResponse, status: number, item: Item) {
  response.writeHead(status, {
    "Content-Type": "application/json",
    ETag: `"${item.version}"`,
    ...(status === 201 ? { Location: `/api/v1/media/${item.id}` } : {}),
  });
  response.end(JSON.stringify({ data: view(item) }));
}

async function raw(request: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks);
}

/** Loại thật theo vài byte đầu, như core (chỉ PNG, JPEG trong core giả). */
function sniff(bytes: Buffer): string | null {
  if (bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return "image/png";
  }
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.subarray(0, 5).toString() === "%PDF-") return "application/pdf";
  return null;
}

/** Kiểm nội dung tải lên; lỗi thì trả lời luôn và trả `null`. */
function checked(
  response: ServerResponse,
  request: IncomingMessage,
  bytes: Buffer,
): { type: string; width: number | null; height: number | null } | null {
  if (bytes.length === 0) {
    problem(response, 422, "validation_failed", "The request has invalid fields.", [
      { field: "body", code: "empty", detail: "is empty" },
    ]);
    return null;
  }
  if (bytes.length > LIMIT) {
    problem(
      response,
      413,
      "media.too_large",
      "The file is larger than 2 MiB, the largest accepted.",
    );
    return null;
  }
  const declared = (request.headers["content-type"] ?? "").split(";")[0]?.trim() ?? "";
  const real = sniff(bytes);
  if (!real) {
    problem(response, 415, "media.unknown_type", "The type of the content could not be detected.");
    return null;
  }
  if (declared && declared !== "application/octet-stream" && declared !== real) {
    problem(
      response,
      415,
      "media.content_mismatch",
      `The content is not a \`${declared}\` file (it looks like \`${real}\`).`,
    );
    return null;
  }
  const png = real === "image/png";
  return {
    type: real,
    width: png ? bytes.readUInt32BE(16) : null,
    height: png ? bytes.readUInt32BE(20) : null,
  };
}

function versionOk(request: IncomingMessage, response: ServerResponse, item: Item): boolean {
  const ifMatch = request.headers["if-match"];
  if (!ifMatch) {
    problem(response, 428, "precondition_required", "Send the ETag you read in If-Match.");
    return false;
  }
  if (ifMatch !== "*" && ifMatch !== `"${item.version}"`) {
    problem(response, 412, "precondition_failed", "The item changed since you read it.");
    return false;
  }
  return true;
}

/** Nội dung một tệp, cả khi chưa đăng nhập (`signedIn` sai thì chỉ tệp công khai). */
export function mediaContent(response: ServerResponse, url: URL, signedIn: boolean): boolean {
  const match = url.pathname.match(/^\/api\/v1\/media\/([^/]+)\/content$/);
  if (!match) return false;
  const item = items.find((i) => i.id === match[1]);
  if (!item || item.trashed_at || (!signedIn && item.visibility !== "public")) {
    problem(response, 404, "media.item_not_found", "No media item has this id that you may load.");
    return true;
  }
  response.writeHead(200, {
    "Content-Type": item.content_type,
    "Content-Length": String(item.bytes.length),
    "Content-Disposition": `inline; filename="${item.name}"`,
    "Cache-Control": item.visibility === "public" ? "public, max-age=60" : "private, no-cache",
    ETag: `"${item.version_id}"`,
  });
  response.end(item.bytes);
  return true;
}

export async function mediaRoutes(
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
  route: string,
): Promise<void> {
  const P = "/api/v1/media";
  if (route === `GET ${P}`) {
    const q = url.searchParams;
    const type = q.get("type");
    const folder = q.get("folder_id");
    const list = items
      .filter((i) => Boolean(i.trashed_at) === (q.get("trashed") === "true"))
      .filter((i) => !folder || (folder === "root" ? !i.folder_id : i.folder_id === folder))
      .filter((i) =>
        !type
          ? true
          : type.endsWith("/*")
            ? i.content_type.startsWith(type.slice(0, -1))
            : i.content_type === type,
      )
      .filter((i) => !q.get("q") || i.name.toLowerCase().includes((q.get("q") ?? "").toLowerCase()))
      .filter((i) => !q.get("visibility") || i.visibility === q.get("visibility"))
      .filter(
        (i) => !q.get("tag") || i.tags.some((t) => t.toLowerCase() === q.get("tag")?.toLowerCase()),
      )
      .filter(
        (i) => q.get("alt_missing") === null || missingAlt(i) === (q.get("alt_missing") === "true"),
      )
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
    const limit = Number(q.get("limit") ?? 50);
    const start = Number(q.get("cursor") ?? 0);
    const withName = q.get("include") === "uploader";
    return send(response, 200, {
      data: list.slice(start, start + limit).map((i) => ({
        ...view(i),
        ...(withName && i.uploaded_by === UPLOADER.id ? { uploaded_by_name: UPLOADER.name } : {}),
      })),
      pagination: {
        limit,
        next_cursor: start + limit < list.length ? String(start + limit) : null,
      },
    } satisfies Schemas["Page_MediaItemResponse"]);
  }
  if (route === `POST ${P}`) {
    const bytes = await raw(request);
    const name = url.searchParams.get("name") ?? "";
    if (!name || /[/\\]/.test(name)) {
      return problem(response, 422, "validation_failed", "The request has invalid fields.", [
        { field: "name", code: "invalid", detail: "must be 1 to 255 characters, without / or \\" },
      ]);
    }
    const kind = checked(response, request, bytes);
    if (!kind) return;
    const id = randomUUID();
    const versionId = randomUUID();
    const at = now();
    const item: Item = {
      id,
      name,
      content_type: kind.type,
      size: bytes.length,
      sha256: "0".repeat(64),
      alt: "",
      alts: {},
      decorative: false,
      title: "",
      caption: "",
      visibility: "private",
      version_id: versionId,
      url: `/api/v1/media/${id}/content?v=${versionId}`,
      width: kind.width,
      height: kind.height,
      folder_id: url.searchParams.get("folder_id"),
      created_at: at,
      updated_at: at,
      trashed_at: null,
      uploaded_by: UPLOADER.id,
      tags: [],
      variants: [],
      bytes,
      version: 1,
    };
    items.push(item);
    response.writeHead(201, {
      "Content-Type": "application/json",
      ETag: `"${item.version}"`,
      Location: `/api/v1/media/${id}`,
    });
    response.end(
      JSON.stringify({
        data: { ...view(item), duplicates: [] },
      } satisfies Schemas["Data_UploadedResponse"]),
    );
    return;
  }
  if (url.pathname.startsWith(`${P}/folders`)) {
    return folderRoutes(request, response, url);
  }
  if (route === `GET ${P}/summary`) {
    const live = items.filter((i) => !i.trashed_at);
    return send(response, 200, {
      data: {
        items: live.length,
        bytes: live.reduce((sum, i) => sum + i.size, 0),
        images_missing_alt: live.filter(missingAlt).length,
        trashed_items: items.length - live.length,
      },
    } satisfies Schemas["Data_LibrarySummaryResponse"]);
  }
  if (route === `GET ${P}/tags`) {
    const names = [...new Set(items.flatMap((i) => i.tags))].sort();
    return send(response, 200, {
      data: names.map((name) => ({
        id: randomUUID(),
        name,
        item_count: items.filter((i) => i.tags.includes(name)).length,
        created_at: "2026-11-15T00:00:00Z",
        updated_at: "2026-11-15T00:00:00Z",
      })),
      pagination: { limit: 200, next_cursor: null },
    } satisfies Schemas["Page_TagResponse"]);
  }
  const match = url.pathname.match(/^\/api\/v1\/media\/([^/]+)(\/.*)?$/);
  const item = items.find((i) => i.id === match?.[1]);
  if (!match || !item) {
    return problem(response, 404, "media.item_not_found", "No media item has this id.");
  }
  // Alt theo ngôn ngữ (core v0.14.0): ngôn ngữ theo `AUTOXIDE_MEDIA_ALT_LOCALES` (mặc định en, vi).
  const alt = (match[2] ?? "").match(/^\/alts\/([^/]+)$/);
  if (alt && (request.method === "PUT" || request.method === "DELETE")) {
    if (!versionOk(request, response, item)) return;
    if (item.trashed_at)
      return problem(response, 409, "media.item_in_trash", "The item is in the trash.");
    const locale = decodeURIComponent(alt[1] ?? "");
    if (!["en", "vi"].includes(locale)) {
      return problem(response, 422, "validation_failed", "The request has invalid fields.", [
        {
          field: "locale",
          code: "media.unsupported_locale",
          detail: "This server keeps alt text in: en, vi.",
        },
      ]);
    }
    if (request.method === "PUT") {
      const body = await json(request);
      const value = text(body, "alt");
      if (value.length > 1000) {
        return problem(response, 422, "validation_failed", "The request has invalid fields.", [
          { field: "alt", code: "too_long", detail: "must be at most 1000 characters" },
        ]);
      }
      item.alts = { ...item.alts, [locale]: value };
    } else {
      const { [locale]: _gone, ...rest } = item.alts;
      item.alts = rest;
    }
    item.version += 1;
    item.updated_at = now();
    return sendItem(response, 200, item);
  }
  const tail = `${request.method} ${match[2] ?? ""}`;
  switch (tail) {
    case "GET ":
      return sendItem(response, 200, item);
    case "PATCH ": {
      if (!versionOk(request, response, item)) return;
      if (item.trashed_at)
        return problem(response, 409, "media.item_in_trash", "The item is in the trash.");
      const body = await json(request);
      for (const key of ["name", "alt", "title", "caption"] as const) {
        if (typeof body[key] === "string") item[key] = text(body, key);
      }
      if (body.visibility === "public" || body.visibility === "private")
        item.visibility = body.visibility;
      if (typeof body.decorative === "boolean") item.decorative = body.decorative;
      if ("folder_id" in body) item.folder_id = (body.folder_id as string | null) ?? null;
      if (Array.isArray(body.tags)) item.tags = (body.tags as string[]).slice().sort();
      item.version += 1;
      item.updated_at = now();
      return sendItem(response, 200, item);
    }
    case "PUT /content": {
      if (!versionOk(request, response, item)) return;
      const bytes = await raw(request);
      const kind = checked(response, request, bytes);
      if (!kind) return;
      item.bytes = bytes;
      item.size = bytes.length;
      item.content_type = kind.type;
      item.width = kind.width;
      item.height = kind.height;
      item.version_id = randomUUID();
      item.url = `/api/v1/media/${item.id}/content?v=${item.version_id}`;
      item.version += 1;
      item.updated_at = now();
      return sendItem(response, 200, item);
    }
    case "DELETE ":
      if (item.trashed_at)
        return problem(response, 409, "media.item_in_trash", "Already in the trash.");
      item.trashed_at = now();
      item.version += 1;
      return sendItem(response, 200, item);
    case "POST /restore":
      if (!item.trashed_at)
        return problem(response, 409, "media.item_not_in_trash", "Not in the trash.");
      item.trashed_at = null;
      item.version += 1;
      return sendItem(response, 200, item);
    case "POST /purge":
      if (!item.trashed_at)
        return problem(response, 409, "media.item_not_in_trash", "Not in the trash.");
      items = items.filter((i) => i !== item);
      response.writeHead(204);
      response.end();
      return;
  }
  return problem(response, 404, "not_found", "No such route in the mock core.");
}

async function folderRoutes(request: IncomingMessage, response: ServerResponse, url: URL) {
  const match = url.pathname.match(/^\/api\/v1\/media\/folders(?:\/([^/]+))?$/);
  const id = match?.[1];
  // Số tệp nằm thẳng trong thư mục, không tính thùng rác (D-267 mục 3).
  for (const f of folders) {
    f.item_count = items.filter((i) => i.folder_id === f.id && !i.trashed_at).length;
  }
  if (!id && request.method === "GET") {
    return send(response, 200, {
      data: [...folders].sort((a, b) => a.name.localeCompare(b.name)),
      pagination: { limit: 200, next_cursor: null },
    } satisfies Schemas["Page_FolderResponse"]);
  }
  if (!id && request.method === "POST") {
    const body = await json(request);
    const name = text(body, "name").trim();
    const parent = (body.parent_id as string | null | undefined) ?? null;
    if (
      folders.some((f) => f.parent_id === parent && f.name.toLowerCase() === name.toLowerCase())
    ) {
      return problem(
        response,
        409,
        "media.folder_name_taken",
        "A folder with this name already exists here.",
      );
    }
    const folder = {
      id: randomUUID(),
      name,
      parent_id: parent,
      item_count: 0,
      created_at: now(),
      updated_at: now(),
    };
    folders.push(folder);
    response.writeHead(201, {
      "Content-Type": "application/json",
      Location: `/api/v1/media/folders/${folder.id}`,
    });
    response.end(JSON.stringify({ data: folder }));
    return;
  }
  const folder = folders.find((f) => f.id === id);
  if (!folder) return problem(response, 404, "media.folder_not_found", "No folder has this id.");
  if (request.method === "PATCH") {
    const body = await json(request);
    if (typeof body.name === "string") folder.name = body.name;
    folder.updated_at = now();
    return send(response, 200, { data: folder });
  }
  if (request.method === "DELETE") {
    if (items.some((i) => i.folder_id === folder.id)) {
      return problem(response, 409, "media.folder_not_empty", "Only empty folders can be deleted.");
    }
    folders = folders.filter((f) => f !== folder);
    response.writeHead(204);
    response.end();
    return;
  }
  return send(response, 200, { data: folder });
}
