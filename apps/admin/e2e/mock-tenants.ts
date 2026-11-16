// Khách hàng (bước 33 của core) cho core giả: khách của request, sổ khách, placement, cài đặt theo
// khách. Hình dạng theo `openapi.json` (`satisfies` kiểu của SDK). Luật như core:
// - mọi tài khoản thuộc khách nền tảng (khách mặc định, id cố định như core);
// - chỉ admin (mọi permission) đọc / quản lý khách, placement, cài đặt;
// - bản cài mặc định một khách (`single`): tạo khách bị từ chối `tenant_single_mode`;
//   `POST /__tenancy {"mode": "multi"}` bật nhiều khách để thử tạo khách;
// - đọc một khách trả `ETag`; `If-Match` cũ thì 412; khách nền tảng không tạm khoá được (422, ô
//   `status`);
// - dời khách (D-292): `POST …/move` chạy thử mặc định (kế hoạch: bảng, số dòng, file, lý do chặn);
//   `dry_run: false` → 201 lượt dời, khách thành `moving`; lượt dời tự đi `copying` → `copied` →
//   `switched` (khách đổi placement, `active` lại) → `done`, mỗi bước `MOVE_STEP_MS`, xem ở
//   `GET …/moves/{id}`. Khách nền tảng không dời được (`tenant_move_platform`);
// - placement `eu-db` có nơi lưu file riêng (S3, chỉ phần không bí mật) để thử `storage`;
// - cài đặt bí mật không bao giờ trả giá trị. Ngoài `kernel.public_url` (như core), có thêm
//   `mail.smtp_url` (bí mật) để thử cách hiện secret.
import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { type Account, empty, json, problem, type Schemas, send, text } from "./mock-http.ts";

type Tenant = Schemas["Tenant"];
type SettingState = Schemas["TenantSettingState"];

const PLATFORM_TENANT = "00000000-0000-7000-8000-000000000001";
const MAIN_PLACEMENT = "00000000-0000-7000-8000-000000000002";
const SLUG = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

const PLACEMENTS: Schemas["Placement"][] = [
  {
    id: MAIN_PLACEMENT,
    name: "main",
    kind: "shared",
    backend: "sqlite",
    schema_state: "ready",
    created_at: "2026-11-01T00:00:00Z",
    storage: null,
  },
  {
    id: "00000000-0000-7000-8000-0000000000e1",
    name: "eu-db",
    kind: "dedicated",
    backend: "postgres",
    schema_state: "ready",
    created_at: "2026-11-02T00:00:00Z",
    storage: {
      kind: "s3",
      bucket: "eu-files",
      prefix: "autoxide",
      region: "eu-central-1",
      endpoint: null,
      dir: null,
      credentials: true,
    },
  },
];

/** Mỗi bước của lượt dời giả mất chừng này. */
const MOVE_STEP_MS = 1500;
const MOVE_FLOW = ["copying", "copied", "switched", "done"] as const;

/** Bảng cấp khách hàng giả sẽ chép, theo thứ tự tạo bảng. */
const TABLES: Schemas["TenantTableRows"][] = [
  { table: "kernel_tenant_settings", rows: 2 },
  { table: "auth_users", rows: 3 },
  { table: "auth_roles", rows: 4 },
  { table: "notes_note", rows: 12 },
];

const SETTINGS: { name: string; description: string; secret: boolean }[] = [
  {
    name: "kernel.public_url",
    description:
      "Public URL of this tenant's site, e.g. `https://shop.example`, used in links sent by mail. When unset, the server-wide AUTOXIDE_HTTP_PUBLIC_URL is used.",
    secret: false,
  },
  {
    name: "mail.smtp_url",
    description: "SMTP server of this tenant, with its password.",
    secret: true,
  },
];

let mode: "single" | "multi" = "single";
let tenants: Tenant[] = [];
let values = new Map<string, { value: string; updated_at: string }>();
let moves: Schemas["TenantMove"][] = [];

export function resetTenants() {
  mode = "single";
  values = new Map();
  moves = [];
  tenants = [
    {
      id: PLATFORM_TENANT,
      slug: "default",
      name: "Default",
      status: "active",
      placement: "main",
      parent_id: null,
      created_at: "2026-11-01T00:00:00Z",
      updated_at: "2026-11-01T00:00:00Z",
    },
  ];
}
resetTenants();

const etagOf = (tenant: Tenant) => `"${Date.parse(tenant.updated_at)}"`;

function state(setting: (typeof SETTINGS)[number]): SettingState {
  const stored = values.get(setting.name);
  return {
    name: setting.name,
    description: setting.description,
    secret: setting.secret,
    is_set: stored !== undefined,
    value: stored && !setting.secret ? stored.value : null,
    updated_at: stored?.updated_at ?? null,
  };
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

/** Cho lượt dời đi tiếp theo thời gian thật; bước `switched` đổi placement của khách. */
function advance(move: Schemas["TenantMove"]) {
  if (move.state === "done" || move.state === "aborted") return;
  const step = Math.min(
    MOVE_FLOW.length - 1,
    Math.floor((Date.now() - Date.parse(move.created_at)) / MOVE_STEP_MS),
  );
  const next = MOVE_FLOW[step] ?? "copying";
  if (next === move.state) return;
  const now = new Date().toISOString();
  move.state = next;
  move.updated_at = now;
  if (step >= 1) {
    move.tables = TABLES;
    move.rows = TABLES.reduce((sum, t) => sum + t.rows, 0);
  }
  if (step >= 2) {
    const tenant = tenants.find((x) => x.id === move.tenant_id);
    if (tenant && tenant.status === "moving") {
      tenant.placement = move.to;
      tenant.status = "active";
      tenant.updated_at = now;
    }
  }
  if (next === "done") move.finished_at = now;
}

/** Lý do chặn của việc dời `tenant` sang `to` (như `check` của core), và lượt dở để chạy tiếp. */
function moveCheck(tenant: Tenant, to: string) {
  const blocking: Schemas["TenantMoveBlocker"][] = [];
  const unfinished = moves.find(
    (m) => m.tenant_id === tenant.id && m.state !== "done" && m.state !== "aborted",
  );
  if (tenant.id === PLATFORM_TENANT) {
    blocking.push({
      code: "tenant_move_platform",
      message:
        "The platform tenant always keeps its data on the placement `main`; it cannot be moved.",
    });
  }
  if (unfinished) {
    if (unfinished.to !== to) {
      blocking.push({
        code: "tenant_move_unfinished",
        message: `An unfinished move to \`${unfinished.to}\` must be finished or aborted first.`,
      });
    } else {
      blocking.push({
        code: "tenant_move_running",
        message: `A move to \`${unfinished.to}\` is running.`,
      });
    }
  } else {
    if (tenant.placement === to) {
      blocking.push({
        code: "tenant_move_same_placement",
        message: `The tenant already keeps its data on the placement \`${to}\`.`,
      });
    }
    if (tenant.status !== "active") {
      blocking.push({
        code: "tenant_move_not_active",
        message: `The tenant is \`${tenant.status}\`; only an active tenant can move.`,
      });
    }
  }
  return blocking;
}

/** Chế độ của bản cài giả (tên miền riêng chỉ nhận ở `multi`, như core). */
export function tenancyMode(): "single" | "multi" {
  return mode;
}

/** `POST /__tenancy {mode}`: đổi chế độ của bản cài giả. */
export async function setTenancy(request: IncomingMessage, response: ServerResponse) {
  mode = text(await json(request), "mode") === "multi" ? "multi" : "single";
  send(response, 204);
}

/** `/api/v1/kernel/tenant…`, `/placements`, `/settings…`. Trả `true` khi đã trả lời. */
export async function tenantRoutes(
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
  account: Account,
): Promise<boolean> {
  const path = url.pathname;
  const method = request.method ?? "GET";
  const admin = account.canReadModules;
  const denied = (permission: string) =>
    problem(response, 403, "permission_denied", `Missing permission \`${permission}\`.`);

  if (path === "/api/v1/kernel/tenant" && method === "GET") {
    const own = tenants.find((x) => x.id === PLATFORM_TENANT) as Tenant;
    send(response, 200, {
      data: {
        id: own.id,
        slug: own.slug,
        name: own.name,
        status: own.status,
        mode,
        platform: true,
      },
    } satisfies Schemas["Data_CurrentTenant"]);
    return true;
  }

  if (path === "/api/v1/kernel/placements" && method === "GET") {
    if (!admin) {
      denied("kernel.placements.read");
      return true;
    }
    send(response, 200, { data: PLACEMENTS } satisfies Schemas["Data_Vec_Placement"]);
    return true;
  }

  if (path === "/api/v1/kernel/tenants" || path.startsWith("/api/v1/kernel/tenants/")) {
    if (!admin) {
      denied(method === "GET" ? "kernel.tenants.read" : "kernel.tenants.manage");
      return true;
    }
    for (const m of moves) advance(m);
    if (path === "/api/v1/kernel/tenants" && method === "GET") {
      const status = url.searchParams.get("status");
      const parent = url.searchParams.get("parent_id");
      const list = [...tenants]
        .reverse()
        .filter((x) => (!status || x.status === status) && (!parent || x.parent_id === parent));
      send(response, 200, page(list, url) satisfies Schemas["Page_Tenant"]);
      return true;
    }
    if (path === "/api/v1/kernel/tenants" && method === "POST") {
      const body = await json(request);
      const slug = text(body, "slug");
      const name = text(body, "name").trim();
      const errors: Schemas["ProblemField"][] = [];
      if (!SLUG.test(slug)) {
        errors.push({
          field: "slug",
          code: "format",
          detail: "must be 1 to 63 lower-case letters, digits and `-`",
        });
      }
      if (!name || name.length > 200) {
        errors.push({ field: "name", code: "length", detail: "must be 1 to 200 characters long" });
      }
      if (errors.length > 0) {
        problem(response, 422, "validation_failed", "The request has invalid fields.", errors);
        return true;
      }
      if (mode === "single") {
        problem(
          response,
          409,
          "tenant_single_mode",
          "This installation runs one tenant; set AUTOXIDE_TENANCY_MODE=multi to add tenants.",
        );
        return true;
      }
      if (tenants.some((x) => x.slug === slug)) {
        problem(response, 409, "tenant_slug_taken", `The slug \`${slug}\` is taken.`);
        return true;
      }
      const placement = text(body, "placement") || "main";
      if (!PLACEMENTS.some((p) => p.name === placement)) {
        problem(response, 404, "tenant_placement_not_found", `No placement \`${placement}\`.`);
        return true;
      }
      const parent = typeof body.parent_id === "string" ? body.parent_id : null;
      if (parent && !tenants.some((x) => x.id === parent)) {
        problem(response, 404, "tenant_not_found", "No tenant has this id.");
        return true;
      }
      const now = new Date().toISOString();
      const created: Tenant = {
        id: randomUUID(),
        slug,
        name,
        status: "active",
        placement,
        parent_id: parent,
        created_at: now,
        updated_at: now,
      };
      tenants.push(created);
      response.setHeader("Location", `/api/v1/kernel/tenants/${created.id}`);
      send(response, 201, { data: created } satisfies Schemas["Data_Tenant"]);
      return true;
    }
    const moveMatch = path.match(/^\/api\/v1\/kernel\/tenants\/([^/]+)\/(move|moves\/([^/]+))$/);
    if (moveMatch) {
      const owner = tenants.find((x) => x.id === moveMatch[1] || x.slug === moveMatch[1]);
      if (!owner) {
        problem(response, 404, "tenant_not_found", "No tenant has this id.");
        return true;
      }
      if (moveMatch[2] === "move" && method === "POST") {
        const body = await json(request);
        const to = text(body, "to");
        const target = PLACEMENTS.find((p) => p.name === to);
        if (!target) {
          problem(response, 404, "tenant_placement_not_found", `No placement \`${to}\`.`);
          return true;
        }
        const keepSource = body.keep_source === true;
        const blocking = moveCheck(owner, to);
        if (body.dry_run !== false) {
          const from =
            moves.find((m) => m.tenant_id === owner.id && m.state !== "done")?.from ??
            owner.placement;
          const source = PLACEMENTS.find((p) => p.name === from);
          const files =
            JSON.stringify(source?.storage ?? null) === JSON.stringify(target.storage ?? null)
              ? 0
              : 4;
          send(response, 200, {
            data: {
              tenant_id: owner.id,
              tenant: owner.slug,
              from,
              to,
              keep_source: keepSource,
              ready: blocking.length === 0,
              blocking,
              resumes: null,
              tables: TABLES,
              rows: TABLES.reduce((sum, t) => sum + t.rows, 0),
              files,
              settle_seconds: 6,
            },
          } satisfies Schemas["Data_TenantMovePlan"]);
          return true;
        }
        const first = blocking[0];
        if (first) {
          problem(response, 409, first.code, first.message);
          return true;
        }
        const now = new Date().toISOString();
        const created: Schemas["TenantMove"] = {
          id: randomUUID(),
          tenant_id: owner.id,
          from: owner.placement,
          to,
          keep_source: keepSource,
          state: "copying",
          tables: [],
          rows: 0,
          error: null,
          created_at: now,
          updated_at: now,
          finished_at: null,
        };
        moves.push(created);
        owner.status = "moving";
        owner.updated_at = now;
        response.setHeader("Location", `/kernel/tenants/${owner.id}/moves/${created.id}`);
        send(response, 201, { data: created } satisfies Schemas["Data_TenantMove"]);
        return true;
      }
      const found = moves.find((m) => m.id === moveMatch[3] && m.tenant_id === owner.id);
      if (method === "GET" && found) {
        advance(found);
        send(response, 200, { data: found } satisfies Schemas["Data_TenantMove"]);
        return true;
      }
      problem(response, 404, "tenant_move_not_found", "No move of this tenant has this id.");
      return true;
    }
    const key = decodeURIComponent(path.slice("/api/v1/kernel/tenants/".length));
    const tenant = tenants.find((x) => x.id === key || x.slug === key);
    if (!tenant) {
      problem(response, 404, "tenant_not_found", "No tenant has this id.");
      return true;
    }
    if (method === "GET") {
      response.setHeader("ETag", etagOf(tenant));
      send(response, 200, { data: tenant } satisfies Schemas["Data_Tenant"]);
      return true;
    }
    if (method === "PATCH") {
      const match = request.headers["if-match"];
      if (typeof match === "string" && match !== etagOf(tenant)) {
        problem(response, 412, "precondition_failed", "The record changed since you read it.");
        return true;
      }
      const body = await json(request);
      const errors: Schemas["ProblemField"][] = [];
      const name = typeof body.name === "string" ? body.name.trim() : null;
      if (name !== null && (!name || name.length > 200)) {
        errors.push({ field: "name", code: "length", detail: "must be 1 to 200 characters long" });
      }
      const status = typeof body.status === "string" ? body.status : null;
      if (status !== null && status !== "active" && status !== "suspended") {
        errors.push({
          field: "status",
          code: "invalid",
          detail: "must be `active` or `suspended`",
        });
      }
      if (tenant.id === PLATFORM_TENANT && status === "suspended") {
        errors.push({
          field: "status",
          code: "invalid",
          detail: "the platform tenant cannot be suspended",
        });
      }
      if (errors.length > 0) {
        problem(response, 422, "validation_failed", "The request has invalid fields.", errors);
        return true;
      }
      if (name !== null) tenant.name = name;
      if (status !== null) tenant.status = status;
      tenant.updated_at = new Date(
        Math.max(Date.now(), Date.parse(tenant.updated_at) + 1),
      ).toISOString();
      response.setHeader("ETag", etagOf(tenant));
      send(response, 200, { data: tenant } satisfies Schemas["Data_Tenant"]);
      return true;
    }
    return false;
  }

  if (path === "/api/v1/kernel/settings" || path.startsWith("/api/v1/kernel/settings/")) {
    if (!admin) {
      denied("kernel.settings.manage");
      return true;
    }
    if (path === "/api/v1/kernel/settings" && method === "GET") {
      send(response, 200, {
        data: SETTINGS.map(state),
      } satisfies Schemas["Data_Vec_TenantSettingState"]);
      return true;
    }
    const name = decodeURIComponent(path.slice("/api/v1/kernel/settings/".length));
    const setting = SETTINGS.find((s) => s.name === name);
    if (!setting) {
      problem(response, 422, "tenant_setting_unknown", `No module takes the setting \`${name}\`.`);
      return true;
    }
    if (method === "PUT") {
      const value = text(await json(request), "value");
      if (!value || value.length > 4000) {
        problem(response, 422, "validation_failed", "The request has invalid fields.", [
          { field: "value", code: "length", detail: "must be 1 to 4000 characters long" },
        ]);
        return true;
      }
      values.set(name, { value, updated_at: new Date().toISOString() });
      send(response, 200, { data: state(setting) } satisfies Schemas["Data_TenantSettingState"]);
      return true;
    }
    if (method === "DELETE") {
      values.delete(name);
      empty(response, 204);
      return true;
    }
    return false;
  }
  return false;
}
