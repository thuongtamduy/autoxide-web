// Cờ giao diện theo người dùng của core giả (`/api/v1/me/flags`, D-207 của core): gợi ý đã tắt,
// "Có gì mới" đã xem. Giữ trong bộ nhớ theo tài khoản (không theo phiên), như core: đăng nhập ở trình
// duyệt khác vẫn thấy cùng cờ. Hình dạng theo `openapi.json` (`Data_Vec_UserFlag`, `Data_UserFlag`).
import type { IncomingMessage, ServerResponse } from "node:http";
import { type Account, empty, json, problem, type Schemas, send } from "./mock-http.ts";

const KEY = /^[a-z0-9._-]{1,100}$/;
const PREFIX = /^[a-z0-9._-]{0,100}$/;
/** `AUTOXIDE_USER_FLAGS_MAX` mặc định của core. */
const MAX = 500;

const flags = new Map<string, Map<string, Schemas["UserFlag"]>>();

export function resetFlags() {
  flags.clear();
}

function invalid(response: ServerResponse, field: string, detail: string) {
  problem(response, 422, "validation_failed", "The request has invalid fields.", [
    { field, code: "invalid", detail },
  ]);
}

/** Trả `true` khi đã xử lý request. */
export async function flagRoutes(
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
  account: Account,
): Promise<boolean> {
  const base = "/api/v1/me/flags";
  if (url.pathname !== base && !url.pathname.startsWith(`${base}/`)) return false;
  const mine = flags.get(account.id) ?? new Map<string, Schemas["UserFlag"]>();
  flags.set(account.id, mine);

  if (request.method === "GET" && url.pathname === base) {
    const prefix = url.searchParams.get("prefix") ?? "";
    if (!PREFIX.test(prefix)) {
      invalid(response, "prefix", "must be lower-case letters, digits, `.`, `_` or `-`");
      return true;
    }
    const data = [...mine.values()]
      .filter((f) => f.key.startsWith(prefix))
      .sort((a, b) => (a.key < b.key ? -1 : 1));
    send(response, 200, { data } satisfies Schemas["Data_Vec_UserFlag"]);
    return true;
  }
  const key = decodeURIComponent(url.pathname.slice(base.length + 1));
  if (request.method === "PUT" && url.pathname.startsWith(`${base}/`)) {
    const body = await json(request);
    if (!KEY.test(key)) {
      invalid(response, "key", "must be 1–100 lower-case letters, digits, `.`, `_` or `-`");
      return true;
    }
    if (typeof body.value !== "string" || body.value.length > 200) {
      invalid(response, "value", "must be a text of at most 200 characters");
      return true;
    }
    if (!mine.has(key) && mine.size >= MAX) {
      problem(
        response,
        409,
        "kernel.flag_limit_reached",
        `You already keep ${MAX} flags; delete some first.`,
      );
      return true;
    }
    const flag = { key, value: body.value, updated_at: new Date().toISOString() };
    mine.set(key, flag);
    send(response, 200, { data: flag } satisfies Schemas["Data_UserFlag"]);
    return true;
  }
  if (request.method === "DELETE" && url.pathname.startsWith(`${base}/`)) {
    mine.delete(key);
    empty(response, 204);
    return true;
  }
  problem(response, 404, "not_found", "No such route in the mock core.");
  return true;
}
