// Phần Cài đặt của core giả: webhook, API key, nhật ký audit, trạng thái AI.
// Hình dạng theo `openapi.json` (`satisfies` kiểu của SDK). Luật như core:
// - webhook chỉ nhận địa chỉ `https://` và event có trong sổ; secret ký chỉ trả lúc tạo / đổi;
// - sửa endpoint gửi `If-Match` cũ thì 412 (`precondition_failed`);
// - tạo API key cần đúng mật khẩu hiện tại (`auth.wrong_password`) và ít nhất một permission;
// - chỉ tài khoản có mọi permission (admin) quản lý webhook, đọc audit, xem AI.
//
// `POST /__webhooks/fire {event}` giả một event: mỗi endpoint đang bật có đăng ký event đó nhận một
// lần giao (`failed`, HTTP 502 khi địa chỉ có chữ "fail"; còn lại `succeeded`, HTTP 200).
import { randomBytes, randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { type Account, empty, json, problem, type Schemas, send, text } from "./mock-http.ts";

type Endpoint = Schemas["EndpointResponse"];
type Delivery = Schemas["DeliveryResponse"];
type ApiKey = Schemas["ApiKeyResponse"] & { owner: string };
type AuditEntry = Schemas["AuditEntryResponse"];

const EVENTS: Schemas["EventTypeResponse"][] = [
  { name: "auth.user_created", description: "A user account was created." },
  { name: "auth.user_deleted", description: "A user account was deleted." },
  { name: "auth.user_updated", description: "A user account was renamed, disabled or enabled." },
  { name: "notes.note_created", description: "A note was created." },
];

let endpoints: Endpoint[] = [];
let deliveries = new Map<string, Delivery[]>();
let keys: ApiKey[] = [];
let audit: AuditEntry[] = [];

export function resetSettings() {
  endpoints = [];
  deliveries = new Map();
  keys = [];
  audit = [
    {
      id: randomUUID(),
      module: "auth",
      action: "auth.user_updated",
      actor_kind: "system",
      subject: "auth.user:01a1e000-0000-7000-8000-000000000001",
      before: { name: "Old name" },
      after: { name: "New name" },
      occurred_at: "2026-11-14T08:00:00Z",
      recorded_at: "2026-11-14T08:00:01Z",
    },
  ];
}
resetSettings();

function record(account: Account, action: string, subject: string, after?: unknown) {
  const now = new Date().toISOString();
  audit.unshift({
    id: randomUUID(),
    module: action.slice(0, action.indexOf(".")),
    action,
    actor_kind: "user",
    actor_user_id: account.id,
    subject,
    ...(after === undefined ? {} : { after }),
    occurred_at: now,
    recorded_at: now,
  });
}

function page<T extends { id: string }>(items: T[], url: URL) {
  const limit = Number(url.searchParams.get("limit") ?? 50);
  const cursor = url.searchParams.get("cursor");
  const start = cursor ? items.findIndex((i) => i.id === cursor) + 1 : 0;
  const data = items.slice(start, start + limit);
  return {
    data,
    pagination: {
      limit,
      next_cursor: start + limit < items.length ? (data.at(-1)?.id ?? null) : null,
    } satisfies Schemas["Pagination"],
  };
}

function forbidden(response: ServerResponse, permission: string) {
  problem(response, 403, "permission_denied", `Missing permission \`${permission}\`.`);
}

/** Kiểm địa chỉ và event như core; trả danh sách lỗi theo ô. */
function checkEndpoint(body: Record<string, unknown>, partial: boolean): Schemas["ProblemField"][] {
  const errors: Schemas["ProblemField"][] = [];
  if (!partial || "url" in body) {
    if (!text(body, "url").startsWith("https://")) {
      errors.push({ field: "url", code: "invalid", detail: "must start with `https://`" });
    }
  }
  if (!partial || "events" in body) {
    const list = Array.isArray(body.events) ? (body.events as string[]) : [];
    if (list.length === 0) {
      errors.push({ field: "events", code: "length", detail: "must list 1 to 100 event names" });
    }
    list.forEach((name, index) => {
      if (name !== "*" && !EVENTS.some((e) => e.name === name)) {
        errors.push({
          field: `events[${index}]`,
          code: "unknown",
          detail: "is not an event of this system",
        });
      }
    });
  }
  return errors;
}

function secret(): string {
  return `whsec_${randomBytes(18).toString("base64url")}`;
}

/** Endpoint của phần Cài đặt. Trả `true` khi đã trả lời. */
export async function settingsRoutes(
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
  account: Account,
): Promise<boolean> {
  const path = url.pathname;
  const method = request.method ?? "GET";
  const admin = account.canReadModules;

  if (method === "GET" && path === "/api/v1/ai/status") {
    if (!admin) {
      forbidden(response, "ai.view");
      return true;
    }
    send(response, 200, {
      data: {
        enabled: false,
        provider: "",
        model: "",
        images: false,
        embeddings_enabled: false,
        embedding_model: "",
        embedding_dimensions: 0,
        tokens_today: 0,
        daily_token_limit: 0,
      },
    } satisfies Schemas["Data_AiStatus"]);
    return true;
  }

  // ------------------------------------------------------------ Webhook
  if (path.startsWith("/api/v1/webhooks")) {
    if (!admin) {
      forbidden(response, "webhooks.manage");
      return true;
    }
    const body = method === "GET" || method === "DELETE" ? {} : await json(request);
    if (path === "/api/v1/webhooks/events" && method === "GET") {
      send(response, 200, { data: EVENTS } satisfies Schemas["Data_Vec_EventTypeResponse"]);
      return true;
    }
    if (path === "/api/v1/webhooks" && method === "GET") {
      send(
        response,
        200,
        page([...endpoints].reverse(), url) satisfies Schemas["Page_EndpointResponse"],
      );
      return true;
    }
    if (path === "/api/v1/webhooks" && method === "POST") {
      const errors = checkEndpoint(body, false);
      if (errors.length > 0) {
        problem(response, 422, "validation_failed", "The request has invalid fields.", errors);
        return true;
      }
      const now = new Date().toISOString();
      const created: Endpoint = {
        id: randomUUID(),
        url: text(body, "url"),
        description: text(body, "description"),
        events: body.events as string[],
        created_at: now,
        updated_at: now,
        disabled_at: null,
      };
      endpoints.push(created);
      deliveries.set(created.id, []);
      record(account, "webhooks.endpoint_created", `webhooks.endpoint:${created.id}`, {
        url: created.url,
      });
      send(response, 201, {
        data: { ...created, secret: secret() },
      } satisfies Schemas["Data_CreatedEndpointResponse"]);
      return true;
    }
    const match = /^\/api\/v1\/webhooks\/([^/]+)(\/secret|\/deliveries)?$/.exec(path);
    const endpoint = match ? endpoints.find((e) => e.id === match[1]) : undefined;
    if (!match || !endpoint) {
      problem(response, 404, "webhooks.endpoint_not_found", "No endpoint has this id.");
      return true;
    }
    const tail = match[2];
    if (tail === "/deliveries" && method === "GET") {
      send(
        response,
        200,
        page(deliveries.get(endpoint.id) ?? [], url) satisfies Schemas["Page_DeliveryResponse"],
      );
      return true;
    }
    if (tail === "/secret" && method === "POST") {
      send(response, 200, { data: { secret: secret() } } satisfies Schemas["Data_SecretResponse"]);
      return true;
    }
    if (!tail && method === "GET") {
      response.setHeader("ETag", `"${endpoint.updated_at}"`);
      send(response, 200, { data: endpoint } satisfies Schemas["Data_EndpointResponse"]);
      return true;
    }
    if (!tail && method === "PATCH") {
      const match = request.headers["if-match"];
      if (match && match !== `"${endpoint.updated_at}"`) {
        problem(response, 412, "precondition_failed", "The record changed since you read it.");
        return true;
      }
      const errors = checkEndpoint(body, true);
      if (errors.length > 0) {
        problem(response, 422, "validation_failed", "The request has invalid fields.", errors);
        return true;
      }
      if (typeof body.url === "string") endpoint.url = body.url;
      if (typeof body.description === "string") endpoint.description = body.description;
      if (Array.isArray(body.events)) endpoint.events = body.events as string[];
      if (typeof body.disabled === "boolean") {
        endpoint.disabled_at = body.disabled ? new Date().toISOString() : null;
      }
      // Mỗi lần sửa một ETag mới, kể cả khi hai lần sửa rơi vào cùng một mili giây.
      endpoint.updated_at = new Date(
        Math.max(Date.now(), Date.parse(endpoint.updated_at) + 1),
      ).toISOString();
      send(response, 200, { data: endpoint } satisfies Schemas["Data_EndpointResponse"]);
      return true;
    }
    if (!tail && method === "DELETE") {
      endpoints = endpoints.filter((e) => e.id !== endpoint.id);
      deliveries.delete(endpoint.id);
      empty(response, 204);
      return true;
    }
    return false;
  }

  // ------------------------------------------------------------ API key
  if (path.startsWith("/api/v1/auth/api-keys")) {
    if (path === "/api/v1/auth/api-keys" && method === "GET") {
      const mine = keys
        .filter((k) => k.owner === account.id)
        .reverse()
        .map(({ owner: _owner, ...key }) => key);
      send(response, 200, page(mine, url) satisfies Schemas["Page_ApiKeyResponse"]);
      return true;
    }
    if (path === "/api/v1/auth/api-keys" && method === "POST") {
      const body = await json(request);
      if (text(body, "current_password") !== account.password) {
        problem(response, 400, "auth.wrong_password", "The current password is incorrect.");
        return true;
      }
      const permissions = Array.isArray(body.permissions) ? (body.permissions as string[]) : [];
      const errors: Schemas["ProblemField"][] = [];
      if (!text(body, "name").trim()) {
        errors.push({ field: "name", code: "length", detail: "must be 1 to 100 characters" });
      }
      if (permissions.length === 0) {
        errors.push({ field: "permissions", code: "length", detail: "must list at least one" });
      }
      if (errors.length > 0) {
        problem(response, 422, "validation_failed", "The request has invalid fields.", errors);
        return true;
      }
      const secretKey = `axk_${randomBytes(20).toString("base64url")}`;
      const created: ApiKey = {
        id: randomUUID(),
        owner: account.id,
        name: text(body, "name"),
        prefix: secretKey.slice(0, 12),
        permissions: [...permissions].sort(),
        created_at: new Date().toISOString(),
        expires_at: typeof body.expires_at === "string" ? body.expires_at : null,
        last_used_at: null,
      };
      keys.push(created);
      record(account, "auth.api_key_created", `auth.api_key:${created.id}`, {
        name: created.name,
      });
      const { owner: _owner, ...view } = created;
      send(response, 201, {
        data: { ...view, key: secretKey },
      } satisfies Schemas["Data_CreatedApiKeyResponse"]);
      return true;
    }
    const id = path.slice("/api/v1/auth/api-keys/".length);
    if (method === "DELETE" && id) {
      const found = keys.find((k) => k.id === id && k.owner === account.id);
      if (!found) {
        problem(response, 404, "auth.api_key_not_found", "You have no key with this id.");
        return true;
      }
      keys = keys.filter((k) => k !== found);
      empty(response, 204);
      return true;
    }
    return false;
  }

  // ------------------------------------------------------------ Audit
  if (path.startsWith("/api/v1/audit")) {
    if (!admin) {
      forbidden(response, "audit.read");
      return true;
    }
    if (path === "/api/v1/audit" && method === "GET") {
      const q = url.searchParams;
      const list = audit.filter(
        (e) =>
          (!q.get("module") || e.module === q.get("module")) &&
          (!q.get("action") || e.action === q.get("action")) &&
          (!q.get("subject") || e.subject === q.get("subject")) &&
          (!q.get("actor_user_id") || e.actor_user_id === q.get("actor_user_id")),
      );
      send(response, 200, page(list, url) satisfies Schemas["Page_AuditEntryResponse"]);
      return true;
    }
    const entry = audit.find((e) => e.id === path.slice("/api/v1/audit/".length));
    if (!entry) {
      problem(response, 404, "audit.entry_not_found", "No entry has this id.");
      return true;
    }
    send(response, 200, { data: entry } satisfies Schemas["Data_AuditEntryResponse"]);
    return true;
  }
  return false;
}

/** `POST /__webhooks/fire`: giao một event giả tới mọi endpoint đang bật có đăng ký nó. */
export async function fireEvent(request: IncomingMessage, response: ServerResponse) {
  const body = await json(request);
  const name = text(body, "event");
  const now = new Date().toISOString();
  let count = 0;
  for (const endpoint of endpoints) {
    if (endpoint.disabled_at) continue;
    if (!endpoint.events.includes("*") && !endpoint.events.includes(name)) continue;
    const fails = endpoint.url.includes("fail");
    const list = deliveries.get(endpoint.id) ?? [];
    list.unshift({
      id: randomUUID(),
      event_id: randomUUID(),
      event_name: name,
      status: fails ? "failed" : "succeeded",
      attempts: fails ? 8 : 1,
      response_status: fails ? 502 : 200,
      last_error: fails ? "The receiver answered 502." : null,
      created_at: now,
      last_attempt_at: now,
      delivered_at: fails ? null : now,
    });
    deliveries.set(endpoint.id, list);
    count += 1;
  }
  send(response, 200, { delivered: count });
}
