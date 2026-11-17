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
//   `mail.connection.smtp.url` (bí mật, nhóm `connection`, tên cũ `mail.smtp_url` vẫn nhận — D-297) để thử cách hiện secret, và cấu hình nghiệp vụ của D-296 (kiểm giá trị
//   như core: 422 `validation_failed`, lỗi ở ô `value`). Mỗi khách một bộ giá trị; nhân sự nền tảng
//   đặt cho khách bất kỳ ở `…/tenants/{id}/settings…` (khách `moving` → 409 `tenant_moving`);
// - sổ khách lọc `read_only`, `placement_kind`, `schema_state`, `subscription_status`, `near_limit=true`
//   (hai bộ lọc sau theo `mock-plans.ts`), `expand=placement,subscription,usage` thêm `expanded`
//   (thuê bao, hạn mức luôn `null` — như core hiện nay); giá trị lạ → 422 theo ô;
// - xuất dữ liệu một khách (`…/tenants/{id}/exports`): lượt mới `pending`, thành `ready` ở lần đọc
//   kế tiếp; tải nội dung khi chưa `ready` → 409 `kernel.export_not_ready`;
// - `read_only` (D-296) độc lập với `status`, khách nền tảng không chỉ đọc được (422 ô `read_only`);
// - `POST /__own-tenant {"read_only": true}`: người đăng nhập thuộc một khách thường đang chỉ đọc
//   (`GET /kernel/tenant`); mock-core từ chối mọi lệnh ghi của họ bằng 403 `tenant_read_only`.
//   `{"status": "suspended" | "maintenance"}`: mọi route có đăng nhập trả 403 `tenant_suspended` /
//   503 `tenant_maintenance`, như `ensure_serving` của core.
import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { type Account, empty, json, problem, type Schemas, send, text } from "./mock-http.ts";
import { isNearLimit, subscriptionStatusOf } from "./mock-plans.ts";

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

/** Bộ kiểm giá trị (như `TenantSetting::checked` của core): câu lỗi của ô `value`, hay `null`. */
type Check = (value: string) => string | null;
const LOCALE = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/;
const locales: Check = (value) => {
  const list = value
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
  return list.length > 0 && list.every((x) => LOCALE.test(x))
    ? null
    : "must be comma-separated language codes like `en` or `pt-BR`";
};
const wholeNumber =
  (max: number): Check =>
  (value) =>
    /^\d+$/.test(value.trim()) && Number(value) <= max
      ? null
      : `must be a whole number from 0 to ${max}`;
const moderation: Check = (value) =>
  ["pre", "first_time", "post"].includes(value.trim())
    ? null
    : "must be `pre`, `first_time` or `post`";

/** `formerly`: tên cũ core vẫn nhận ở `PUT` / `DELETE` (D-297), response mang tên mới. */
const SETTINGS: {
  name: string;
  description: string;
  secret: boolean;
  group?: "connection";
  formerly?: string;
  check?: Check;
}[] = [
  {
    name: "kernel.public_url",
    description:
      "Public URL of this tenant's site, e.g. `https://shop.example`, used in links sent by mail. When unset, the server-wide AUTOXIDE_HTTP_PUBLIC_URL is used.",
    secret: false,
  },
  {
    name: "mail.connection.smtp.url",
    description: "SMTP server of this tenant, with its password.",
    secret: true,
    group: "connection",
    formerly: "mail.smtp_url",
  },
  {
    name: "mail.connection.smtp.from",
    description: "Sender of this tenant's mail, like `Shop <no-reply@shop.example>`.",
    secret: false,
    group: "connection",
    formerly: "mail.from",
  },
  // Như module `ai` của core: khoá API và mô hình riêng của khách (nhóm `connection`, D-297).
  {
    name: "ai.connection.text.api_key",
    description:
      "API key this tenant's AI requests use (its own account with the provider the server is set up for); unset: the server's key.",
    secret: true,
    group: "connection",
    formerly: "ai.api_key",
  },
  {
    name: "ai.connection.text.model",
    description:
      "Model this tenant's AI requests use, from the provider the server is set up for; unset: the server's model.",
    secret: false,
    group: "connection",
    formerly: "ai.model",
  },
  {
    name: "comments.max_links",
    description:
      "A comment with more links than this is held for approval (0 to 100), instead of the server's AUTOXIDE_COMMENTS_MAX_LINKS.",
    secret: false,
    check: wholeNumber(100),
  },
  {
    name: "comments.guest_moderation",
    description:
      "When a guest's comment needs approval: `pre`, `first_time` or `post`, instead of the server's AUTOXIDE_COMMENTS_GUEST_MODERATION.",
    secret: false,
    check: moderation,
  },
  {
    name: "content.default_locale",
    description:
      "Language used when a request names none, instead of the server's AUTOXIDE_CONTENT_DEFAULT_LOCALE.",
    secret: false,
    check: (value) =>
      LOCALE.test(value.trim()) ? null : "must be a language code like `en` or `pt-BR`",
  },
  {
    name: "content.locales",
    description:
      "Languages this tenant's content may be written in, comma-separated BCP 47 codes (e.g. `en,vi`), instead of the server's AUTOXIDE_CONTENT_LOCALES.",
    secret: false,
    check: locales,
  },
  {
    name: "forms.retention_days",
    description:
      "Days a submission is kept before the daily job deletes it (0 to 36500), instead of the server's AUTOXIDE_FORMS_RETENTION_DAYS.",
    secret: false,
    check: wholeNumber(36_500),
  },
  {
    name: "media.alt_locales",
    description:
      "Languages this tenant's text alternatives (`alt`) may be translated into, comma-separated BCP 47 codes, instead of the server's AUTOXIDE_MEDIA_ALT_LOCALES.",
    secret: false,
    check: locales,
  },
];
// Như core: sổ cấu hình xếp theo tên.
SETTINGS.sort((a, b) => a.name.localeCompare(b.name));

/** Khách thường dùng khi người đăng nhập "thuộc" một khách chỉ đọc (`POST /__own-tenant`). */
const CUSTOMER_TENANT = "00000000-0000-7000-8000-0000000000c1";

let mode: "single" | "multi" = "single";
let tenants: Tenant[] = [];
/** Giá trị cấu hình theo khách: id khách → tên → giá trị. */
let values = new Map<string, Map<string, { value: string; updated_at: string }>>();
let moves: Schemas["TenantMove"][] = [];
/** Migration chờ theo placement (`POST /__placements/behind`), và các lượt chạy (D-334). */
let behind = new Map<string, string[]>();
let runs: Schemas["MigrationRun"][] = [];
/** Lượt xuất dữ liệu theo khách; lượt `pending` thành `ready` ở lần đọc kế tiếp. */
let exports = new Map<string, Schemas["TenantExport"][]>();
/** Khách của người đăng nhập (mặc định khách nền tảng). */
let own = PLATFORM_TENANT;

export function resetTenants() {
  mode = "single";
  values = new Map();
  moves = [];
  exports = new Map();
  behind = new Map();
  runs = [];
  for (const p of PLACEMENTS) p.schema_state = "ready";
  own = PLATFORM_TENANT;
  tenants = [
    {
      id: PLATFORM_TENANT,
      slug: "default",
      name: "Default",
      status: "active",
      placement: "main",
      parent_id: null,
      read_only: false,
      created_at: "2026-11-01T00:00:00Z",
      updated_at: "2026-11-01T00:00:00Z",
    },
  ];
}
resetTenants();

function valuesOf(tenant: string) {
  let map = values.get(tenant);
  if (!map) {
    map = new Map();
    values.set(tenant, map);
  }
  return map;
}

const etagOf = (tenant: Tenant) => `"${Date.parse(tenant.updated_at)}"`;

function state(setting: (typeof SETTINGS)[number], tenant = own): SettingState {
  const stored = valuesOf(tenant).get(setting.name);
  return {
    name: setting.name,
    description: setting.description,
    group: setting.group ?? null,
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

/** Có khách với slug hay id này không (header `Autoxide-Tenant` khi đăng nhập ở chế độ `multi`). */
export function knownTenant(raw: string): boolean {
  return tenants.some((x) => x.id === raw || x.slug === raw);
}

/** Trạng thái khách của người đăng nhập (`suspended`, `maintenance` chặn mọi route, như `ensure_serving`). */
export function ownStatus(): string {
  return tenants.find((x) => x.id === own)?.status ?? "active";
}

/** Khách của người đăng nhập đang chỉ đọc: mock-core từ chối mọi lệnh ghi (như `ensure_writable`). */
export function ownReadOnly(): boolean {
  return tenants.find((x) => x.id === own)?.read_only === true;
}

/**
 * Cấu hình cho giao diện theo khách của credential (D-296): ngôn ngữ của nội dung và của `alt` mà
 * khách tự đặt thay giá trị chung.
 */
export function ownClientConfig(
  base: Schemas["ClientConfigResponse"],
): Schemas["ClientConfigResponse"] {
  const mine = valuesOf(own);
  const list = (name: string) =>
    mine
      .get(name)
      ?.value.split(",")
      .map((x) => x.trim())
      .filter(Boolean);
  const contentLocales = list("content.locales");
  const altLocales = list("media.alt_locales");
  const defaultLocale = mine.get("content.default_locale")?.value.trim();
  return {
    ...base,
    content: {
      ...base.content,
      ...(contentLocales ? { locales: contentLocales } : {}),
      ...(defaultLocale ? { default_locale: defaultLocale } : {}),
    },
    media: { ...base.media, ...(altLocales ? { alt_locales: altLocales } : {}) },
  };
}

/**
 * `POST /__own-tenant {"read_only"?: bool, "status"?: "suspended" | "maintenance", "customer"?: bool}`:
 * người đăng nhập thuộc khách thường `acme-ro` (tên "Acme Read-only") với cờ chỉ đọc và trạng thái đã
 * nêu; không nêu gì (hay `read_only: false`) thì về khách nền tảng.
 */
export async function setOwnTenant(request: IncomingMessage, response: ServerResponse) {
  const body = await json(request);
  const status = body.status === "suspended" || body.status === "maintenance" ? body.status : null;
  if (body.read_only === true || status !== null || body.customer === true) {
    tenants = tenants.filter((x) => x.id !== CUSTOMER_TENANT);
    tenants.push({
      id: CUSTOMER_TENANT,
      slug: "acme-ro",
      name: "Acme Read-only",
      status: status ?? "active",
      placement: "main",
      parent_id: null,
      read_only: body.read_only === true,
      created_at: "2026-11-03T00:00:00Z",
      updated_at: "2026-11-03T00:00:00Z",
    });
    own = CUSTOMER_TENANT;
  } else {
    own = PLATFORM_TENANT;
  }
  send(response, 204);
}

/** Câu lỗi của một giá trị lọc không nhận (như core: gom mọi ô sai một lần). */
function listProblems(url: URL): Schemas["ProblemField"][] {
  const errors: Schemas["ProblemField"][] = [];
  const kind = url.searchParams.get("placement_kind");
  if (kind && kind !== "shared" && kind !== "dedicated") {
    errors.push({
      field: "placement_kind",
      code: "invalid",
      detail: "must be `shared` or `dedicated`",
    });
  }
  const schema = url.searchParams.get("schema_state");
  if (schema && !["ready", "behind", "migrating"].includes(schema)) {
    errors.push({
      field: "schema_state",
      code: "invalid",
      detail: "must be one of ready, behind, migrating",
    });
  }
  const sub = url.searchParams.get("subscription_status");
  if (
    sub &&
    !["trialing", "active", "past_due", "suspended", "canceled", "deleted"].includes(sub)
  ) {
    errors.push({
      field: "subscription_status",
      code: "invalid",
      detail: "must be one of trialing, active, past_due, suspended, canceled, deleted",
    });
  }
  const expand = (url.searchParams.get("expand") ?? "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
  if (expand.some((x) => !["placement", "subscription", "usage"].includes(x))) {
    errors.push({
      field: "expand",
      code: "invalid",
      detail: "can only list placement, subscription and usage",
    });
  }
  return errors;
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
    const mine = tenants.find((x) => x.id === own) as Tenant;
    send(response, 200, {
      data: {
        id: mine.id,
        slug: mine.slug,
        name: mine.name,
        status: mine.status,
        mode,
        platform: mine.id === PLATFORM_TENANT,
        read_only: mine.read_only === true,
      },
    } satisfies Schemas["Data_CurrentTenant"]);
    return true;
  }

  if (path === "/api/v1/kernel/placements/migrations") {
    if (!admin) {
      denied("kernel.tenants.operate");
      return true;
    }
    return migrationRoute(request, response, method, account);
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
      const errors = listProblems(url);
      if (errors.length > 0) {
        problem(response, 422, "validation_failed", "The request has invalid fields.", errors);
        return true;
      }
      const status = url.searchParams.get("status");
      const parent = url.searchParams.get("parent_id");
      const readOnly = url.searchParams.get("read_only");
      const kind = url.searchParams.get("placement_kind");
      const schema = url.searchParams.get("schema_state");
      // Thuê bao và hạn mức: theo module `plans` giả (`mock-plans.ts`).
      const subStatus = url.searchParams.get("subscription_status");
      const near = url.searchParams.get("near_limit") === "true";
      const placementOf = (x: Tenant) => PLACEMENTS.find((p) => p.name === x.placement);
      const list = [...tenants]
        .reverse()
        .filter(
          (x) =>
            (!subStatus || subscriptionStatusOf(x.id) === subStatus) &&
            (!near || isNearLimit(x.id)) &&
            (!status || x.status === status) &&
            (!parent || x.parent_id === parent) &&
            (readOnly === null || String(x.read_only === true) === readOnly) &&
            (!kind || placementOf(x)?.kind === kind) &&
            (!schema || placementOf(x)?.schema_state === schema),
        );
      const expand = url.searchParams.get("expand");
      const result = page(list, url);
      send(response, 200, {
        ...result,
        data: expand
          ? result.data.map((x) => ({
              ...x,
              expanded: {
                placement: expand.includes("placement") ? (placementOf(x) ?? null) : null,
                subscription: null,
                usage: null,
              },
            }))
          : result.data,
      } satisfies Schemas["Page_Tenant"]);
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
        read_only: false,
        created_at: now,
        updated_at: now,
      };
      tenants.push(created);
      response.setHeader("Location", `/api/v1/kernel/tenants/${created.id}`);
      send(response, 201, { data: created } satisfies Schemas["Data_Tenant"]);
      return true;
    }
    const exportMatch = path.match(
      /^\/api\/v1\/kernel\/tenants\/([^/]+)\/exports(?:\/([^/]+)(\/content)?)?$/,
    );
    if (exportMatch) return exportRoute(response, method, account, exportMatch);
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
    const settingsMatch = path.match(
      /^\/api\/v1\/kernel\/tenants\/([^/]+)\/settings(?:\/([^/]+))?$/,
    );
    if (settingsMatch) {
      const owner = tenants.find((x) => x.id === settingsMatch[1] || x.slug === settingsMatch[1]);
      if (!owner) {
        problem(response, 404, "tenant_not_found", "No tenant has this id.");
        return true;
      }
      return settingRoute(request, response, method, owner, settingsMatch[2]);
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
      // `reason` (D-334): 1–500 ký tự, chỉ ghi vào event audit.
      if (typeof body.reason === "string" && (!body.reason.trim() || body.reason.length > 500)) {
        errors.push({
          field: "reason",
          code: "length",
          detail: "must be 1 to 500 characters long",
        });
      }
      const readOnly = typeof body.read_only === "boolean" ? body.read_only : null;
      if (tenant.id === PLATFORM_TENANT && readOnly === true) {
        errors.push({
          field: "read_only",
          code: "invalid",
          detail: "the platform tenant cannot be made read-only",
        });
      }
      if (errors.length > 0) {
        problem(response, 422, "validation_failed", "The request has invalid fields.", errors);
        return true;
      }
      if (name !== null) tenant.name = name;
      if (status !== null) tenant.status = status;
      if (readOnly !== null) tenant.read_only = readOnly;
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
    const name =
      path === "/api/v1/kernel/settings"
        ? undefined
        : path.slice("/api/v1/kernel/settings/".length);
    return settingRoute(
      request,
      response,
      method,
      tenants.find((x) => x.id === own) as Tenant,
      name,
    );
  }
  return false;
}

/**
 * Cấu hình theo khách của `tenant`: cả sổ (`name` trống, GET), đặt (PUT), bỏ (DELETE). Dùng cho
 * `/kernel/settings…` (khách của người đăng nhập) và `/kernel/tenants/{id}/settings…` (nhân sự nền
 * tảng); khách đang dời thì ghi bị từ chối `tenant_moving`, như core.
 */
async function settingRoute(
  request: IncomingMessage,
  response: ServerResponse,
  method: string,
  tenant: Tenant,
  raw: string | undefined,
): Promise<boolean> {
  if (raw === undefined) {
    if (method !== "GET") return false;
    send(response, 200, {
      data: SETTINGS.map((s) => state(s, tenant.id)),
    } satisfies Schemas["Data_Vec_TenantSettingState"]);
    return true;
  }
  const name = decodeURIComponent(raw);
  const setting = SETTINGS.find((s) => s.name === name || s.formerly === name);
  if (!setting) {
    problem(response, 422, "tenant_setting_unknown", `No module takes the setting \`${name}\`.`);
    return true;
  }
  if ((method === "PUT" || method === "DELETE") && tenant.status === "moving") {
    problem(
      response,
      409,
      "tenant_moving",
      "The tenant is being moved to another placement; try again when the move is done.",
    );
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
    const wrong = setting.check?.(value) ?? null;
    if (wrong) {
      problem(response, 422, "validation_failed", "The request has invalid fields.", [
        { field: "value", code: "invalid", detail: wrong },
      ]);
      return true;
    }
    valuesOf(tenant.id).set(name, { value, updated_at: new Date().toISOString() });
    send(response, 200, {
      data: state(setting, tenant.id),
    } satisfies Schemas["Data_TenantSettingState"]);
    return true;
  }
  if (method === "DELETE") {
    valuesOf(tenant.id).delete(name);
    empty(response, 204);
    return true;
  }
  return false;
}

/** `/kernel/tenants/{id}/exports[/{export_id}[/content]]`. */
function exportRoute(
  response: ServerResponse,
  method: string,
  account: Account,
  match: RegExpMatchArray,
): true {
  const owner = tenants.find((x) => x.id === match[1]);
  if (!owner) {
    problem(response, 404, "tenant_not_found", "No tenant has this id.");
    return true;
  }
  const list = exports.get(owner.id) ?? [];
  const exportId = match[2];
  if (!exportId && method === "POST") {
    const running = list.find((x) => x.status === "pending" || x.status === "running");
    const now = new Date().toISOString();
    const created: Schemas["TenantExport"] = running ?? {
      id: randomUUID(),
      tenant_id: owner.id,
      status: "pending",
      reason: "manual",
      requested_by: account.id,
      tables: [],
      size: null,
      error: null,
      expires_at: null,
      created_at: now,
      updated_at: now,
    };
    if (!running) exports.set(owner.id, [created, ...list]);
    response.setHeader("Location", `/api/v1/kernel/tenants/${owner.id}/exports/${created.id}`);
    send(response, 201, { data: created });
    return true;
  }
  // Lượt đang chờ xong ở lần đọc kế tiếp (thay cho job chạy nền).
  for (const job of list) {
    if (job.status === "pending") {
      job.status = "ready";
      job.tables = [
        { table: "auth_users", rows: 3 },
        { table: "content_entries", rows: 12 },
      ];
      job.size = 18_432;
      job.expires_at = new Date(Date.now() + 7 * 86_400_000).toISOString();
      job.updated_at = new Date().toISOString();
    }
  }
  if (!exportId && method === "GET") {
    send(response, 200, { data: list } satisfies Schemas["Data_Vec_TenantExport"]);
    return true;
  }
  const job = list.find((x) => x.id === exportId);
  if (!job) {
    problem(response, 404, "kernel.export_not_found", "No such export.");
    return true;
  }
  if (!match[3] && method === "GET") {
    send(response, 200, { data: job } satisfies Schemas["Data_TenantExport"]);
    return true;
  }
  if (job.status !== "ready") {
    problem(response, 409, "kernel.export_not_ready", "The export is not ready.");
    return true;
  }
  const lines = [
    { export: { tenant_id: owner.id, created_at: job.created_at } },
    { table: "auth_users", row: { id: account.id, email: account.email } },
  ];
  response.writeHead(200, { "Content-Type": "application/x-ndjson" });
  response.end(`${lines.map((line) => JSON.stringify(line)).join("\n")}\n`);
  return true;
}

/** `POST /__placements/behind {name, migrations}`: placement `name` còn các migration chờ. */
export async function setPlacementBehind(request: IncomingMessage, response: ServerResponse) {
  const body = (await json(request)) as { name?: string; migrations?: string[] };
  const found = PLACEMENTS.find((p) => p.name === body.name);
  if (found) {
    found.schema_state = "behind";
    behind.set(found.name, body.migrations ?? ["notes/m0009_example"]);
  }
  empty(response, 204);
}

/**
 * `/kernel/placements/migrations` (D-334): chạy thử trả migration chờ; chạy thật tạo lượt `pending`,
 * lượt đó xong (`done`, placement `ready`) ở lần đọc danh sách kế tiếp. Một lượt một lúc.
 */
async function migrationRoute(
  request: IncomingMessage,
  response: ServerResponse,
  method: string,
  account: Account,
): Promise<true> {
  const finish = () => {
    for (const run of runs) {
      if (run.status !== "pending") continue;
      run.status = "done";
      run.applied = [...behind]
        .filter(([name]) => !run.placement || name === run.placement)
        .map(([placement, migrations]) => ({ placement, migrations }));
      for (const done of run.applied) {
        behind.delete(done.placement);
        const found = PLACEMENTS.find((p) => p.name === done.placement);
        if (found) found.schema_state = "ready";
      }
      run.updated_at = new Date().toISOString();
    }
  };
  if (method === "GET") {
    finish();
    send(response, 200, { data: [...runs].reverse() } satisfies Schemas["Data_Vec_MigrationRun"]);
    return true;
  }
  const body = (await json(request)) as Schemas["MigrationRunRequest"];
  const placement = body.placement ?? null;
  if (placement && !PLACEMENTS.some((p) => p.name === placement)) {
    problem(response, 404, "tenant_placement_not_found", `No placement \`${placement}\`.`);
    return true;
  }
  const pending = PLACEMENTS.filter(
    (p) => p.name !== "main" && (!placement || p.name === placement),
  );
  if (body.dry_run) {
    send(response, 200, {
      data: {
        dry_run: true,
        pending: pending.map((p) => ({ placement: p.name, migrations: behind.get(p.name) ?? [] })),
      },
    } satisfies Schemas["Data_MigrationDryRun"]);
    return true;
  }
  if (runs.some((r) => r.status === "pending" || r.status === "running")) {
    problem(response, 409, "kernel.migration_run_busy", "A migration run is already in progress.");
    return true;
  }
  const now = new Date().toISOString();
  const run: Schemas["MigrationRun"] = {
    id: randomUUID(),
    placement,
    status: "pending",
    applied: [],
    error: null,
    requested_by: account.id,
    created_at: now,
    updated_at: now,
  };
  runs.push(run);
  for (const p of pending) if (behind.has(p.name)) p.schema_state = "migrating";
  send(response, 201, { data: run } satisfies Schemas["Data_MigrationRun"]);
  return true;
}
