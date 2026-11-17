// Cây tổ chức của core giả (module `organizations`, bước 34 của core): nút, loại nút, cài đặt kế
// thừa, membership theo nút, hồ sơ công khai, danh sách cửa hàng công khai cho website. Hình dạng theo
// `openapi.json`; luật rút gọn: nút mới `active`, mã nội bộ trùng → 409, cài đặt lạ → 404.
//
// Cây: Trụ sở (gốc, id = id của khách) › Miền Nam › CN Quận 3, Kho Thủ Đức. Membership: tài khoản
// admin ở gốc (role `admin`), "Hoàng Nam" ở Miền Nam (role `editor`), "Ngô Mai" ở CN Quận 3.
import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { ModuleInfo } from "@autoxide/sdk";
import { ADMIN_ROLE, roleById } from "./mock-access.ts";
import { json, problem, type Schemas, send } from "./mock-http.ts";

type Unit = Schemas["UnitResponse"];
type Profile = Schemas["PublicProfileResponse"];

/** Nút gốc: id của khách (core một khách dùng cùng id này cho dữ liệu cấp khách). */
export const ROOT_UNIT = "00000000-0000-7000-8000-000000000001";
export const REGION_UNIT = "01a1e300-0000-7000-8000-0000000000b1";
export const STORE_UNIT = "01a1e300-0000-7000-8000-0000000000b2";
const WAREHOUSE_UNIT = "01a1e300-0000-7000-8000-0000000000b3";
const EDITOR_ROLE = "01a1e000-0000-7000-8000-00000000ed01";
const NAM = "01a1e300-0000-7000-8000-0000000000c1";
const MAI = "01a1e300-0000-7000-8000-0000000000c2";

/** Người dùng chỉ có ở cây (không đăng nhập được), để bảng thành viên có tên. */
export const ORG_PEOPLE: Schemas["UserResponse"][] = [
  person(NAM, "Hoàng Nam", "nam@example.com"),
  person(MAI, "Ngô Mai", "mai@example.com"),
];

function person(id: string, name: string, email: string): Schemas["UserResponse"] {
  return {
    id,
    name,
    email,
    email_verified_at: null,
    disabled_at: null,
    has_password: true,
    mfa_enabled: false,
    last_sign_in_at: null,
    created_at: "2026-11-12T00:00:00Z",
    updated_at: "2026-11-12T00:00:00Z",
  };
}

const TYPES: Schemas["UnitTypeResponse"][] = [
  ["tenant", "Head office"],
  ["region", "Region"],
  ["store", "Store"],
  ["warehouse", "Warehouse"],
].map(([code = "", name = ""]) => ({
  code,
  name,
  description: "",
  created_at: "2026-11-12T00:00:00Z",
  updated_at: "2026-11-12T00:00:00Z",
}));

/** `schema` của cài đặt: SDK sinh kiểu object rỗng cho JSON Schema tự do, nên ép kiểu ở đây. */
function shape(schema: object): Record<string, never> {
  return schema as Record<string, never>;
}

const CATALOG: Schemas["SettingResponse"][] = [
  {
    key: "organizations.timezone",
    description: "Time zone of the unit (IANA name, e.g. `Asia/Ho_Chi_Minh`).",
    default: "UTC",
    // Dạng giá trị như core khai (D-332).
    schema: shape({ type: "string", format: "iana-time-zone", examples: ["Asia/Ho_Chi_Minh"] }),
  },
  {
    key: "organizations.currency",
    description: "Currency (ISO 4217, e.g. `VND`).",
    default: null,
    schema: shape({ type: "string", pattern: "^[A-Z]{3}$", examples: ["VND"] }),
  },
  {
    key: "auth.support_access",
    description: "Whether platform staff may be granted time-limited access for support.",
    default: true,
    schema: shape({ type: "boolean" }),
  },
  {
    key: "auth.customer_registration",
    description: "Whether customers can create their own accounts on this tenant's shop.",
    default: true,
    schema: shape({ type: "boolean" }),
  },
  {
    key: "organizations.languages",
    description: "Languages of the website, the first is the default.",
    default: ["en"],
    schema: shape({ type: "array", items: { type: "string" }, minItems: 1, uniqueItems: true }),
  },
];

/** Danh mục hành chính rút gọn (module `address`): hai tỉnh, mỗi tỉnh hai phường. */
const PROVINCES: Schemas["AdministrativeUnit"][] = [
  admin("01", "Thành phố Hà Nội", "city", 1, null),
  admin("79", "Thành phố Hồ Chí Minh", "city", 1, null),
];
const COMMUNES: Schemas["AdministrativeUnit"][] = [
  admin("00004", "Phường Ba Đình", "ward", 2, "01"),
  admin("00070", "Phường Hoàn Kiếm", "ward", 2, "01"),
  admin("00166", "Phường Cầu Giấy", "ward", 2, "01"),
  admin("26743", "Phường Bến Thành", "ward", 2, "79"),
  admin("27139", "Phường Xuân Hòa", "ward", 2, "79"),
];

function admin(
  code: string,
  name: string,
  kind: string,
  level: number,
  parent: string | null,
): Schemas["AdministrativeUnit"] {
  return { code, name, kind, level, parent_code: parent, valid_from: "2025-07-01", valid_to: null };
}

export const ORG_MODULE: ModuleInfo = {
  name: "organizations",
  internal: false,
  always_enabled: true,
  features: [],
  limits: [],
  requires: [],
  position: 2,
  permissions: [
    { name: "organizations.units.read", description: "See units.", risk: "read" },
    { name: "organizations.units.write", description: "Add units.", risk: "write" },
  ],
  events: [],
  subscriptions: [],
  jobs: [],
  schedules: [],
  tools: [],
  deprecations: [],
  languages: ["en", "vi"],
  migrations: [{ name: "m0001_units", applied: true }],
};

let units: Unit[] = [];
/** Giá trị đặt riêng: `<unit>|<key>` → giá trị. */
let values = new Map<string, unknown>();
let memberships: Schemas["MembershipRowResponse"][] = [];
let profiles = new Map<string, Profile>();
let clock = 0;

function at(): string {
  clock += 1000;
  return new Date(Date.parse("2026-11-16T00:00:00Z") + clock).toISOString();
}

function unit(id: string, parent: string | null, type: string, name: string, code?: string): Unit {
  const now = at();
  return {
    id,
    parent_id: parent,
    unit_type: type,
    name,
    code: code ?? null,
    status: "active",
    status_reason: null,
    created_at: now,
    updated_at: now,
  };
}

function profile(id: string): Profile {
  const found = units.find((u) => u.id === id);
  return (
    profiles.get(id) ?? {
      unit_id: id,
      unit_type: found?.unit_type ?? "store",
      public: false,
      position: 0,
      display_name: found?.name ?? "",
      address: null,
      cover_media_id: null,
      opening_hours: [],
      special_days: [],
      pickup: false,
      updated_at: null,
    }
  );
}

export function resetOrg(adminId?: string) {
  clock = 0;
  units = [
    unit(ROOT_UNIT, null, "tenant", "Trụ sở"),
    unit(REGION_UNIT, ROOT_UNIT, "region", "Miền Nam"),
    unit(STORE_UNIT, REGION_UNIT, "store", "CN Quận 3", "CH-Q3"),
    unit(WAREHOUSE_UNIT, REGION_UNIT, "warehouse", "Kho Thủ Đức"),
  ];
  values = new Map([[`${ROOT_UNIT}|organizations.timezone`, "Asia/Ho_Chi_Minh"]]);
  const row = (user: string, org: string, role: string, name: string) => ({
    id: randomUUID(),
    user_id: user,
    org_id: org,
    role_id: role,
    role_name: name,
    inherited: false,
    created_at: at(),
  });
  memberships = [
    ...(adminId ? [row(adminId, ROOT_UNIT, ADMIN_ROLE, "admin")] : []),
    row(NAM, REGION_UNIT, EDITOR_ROLE, "editor"),
    row(MAI, STORE_UNIT, EDITOR_ROLE, "editor"),
  ];
  profiles = new Map();
  profiles.set(ROOT_UNIT, {
    ...profile(ROOT_UNIT),
    public: true,
    display_name: "Bếp Mộc",
    updated_at: at(),
  });
  profiles.set(STORE_UNIT, {
    ...profile(STORE_UNIT),
    public: true,
    position: 1,
    display_name: "Bếp Mộc Quận 3",
    pickup: true,
    opening_hours: [1, 2, 3, 4, 5, 6, 7].map((day) => ({ day, opens: "08:00", closes: "21:30" })),
    updated_at: at(),
  });
}
resetOrg();

/** Chuỗi tổ tiên (gồm nút), từ nút lên gốc. */
function chain(id: string): Unit[] {
  const out: Unit[] = [];
  let current = units.find((u) => u.id === id);
  while (current) {
    out.push(current);
    const parent = current.parent_id;
    current = parent ? units.find((u) => u.id === parent) : undefined;
  }
  return out;
}

function page<T>(data: T[], url: URL) {
  return {
    data,
    pagination: { limit: Number(url.searchParams.get("limit") ?? 50), next_cursor: null },
  };
}

function effective(id: string): Schemas["UnitSettingResponse"][] {
  return CATALOG.map((setting) => {
    for (const node of chain(id)) {
      const key = `${node.id}|${setting.key}`;
      if (values.has(key)) {
        return {
          key: setting.key,
          value: values.get(key),
          inherited: node.id !== id,
          source_unit_id: node.id,
        };
      }
    }
    return {
      key: setting.key,
      value: setting.default ?? null,
      inherited: true,
      source_unit_id: null,
    };
  });
}

/** `POST /__org/root-name` (`{"name"}`): đổi tên công khai của nút gốc, để thử tên của website. */
export async function setRootName(request: IncomingMessage, response: ServerResponse) {
  const body = (await json(request)) as { name?: string };
  profiles.set(ROOT_UNIT, { ...profile(ROOT_UNIT), display_name: body.name ?? "Bếp Mộc" });
  send(response, 204);
}

/** Nút của cây (tên, loại) cho `org_name` / `org_unit_type` của membership (D-333). */
export function unitOf(id: string): { name: string; unit_type: string } | undefined {
  return units.find((u) => u.id === id);
}

/** Người dùng trong cây (cho `GET /auth/users/{id}`); `undefined` khi không phải người của cây. */
export function orgPerson(id: string): Schemas["UserResponse"] | undefined {
  return ORG_PEOPLE.find((p) => p.id === id);
}

/** Membership của một người, gom theo nút (`mock-team.ts`). */
export function membershipsOf(userId: string): { org_id: string; role_ids: string[] }[] {
  const out = new Map<string, string[]>();
  for (const row of memberships.filter((m) => m.user_id === userId)) {
    out.set(row.org_id, [...(out.get(row.org_id) ?? []), row.role_id]);
  }
  return [...out].map(([org_id, role_ids]) => ({ org_id, role_ids }));
}

/** Thay mọi membership của một người (`PUT /auth/users/{id}/memberships`). */
export function setMembershipsOf(
  userId: string,
  list: readonly { org_id: string; role_ids: readonly string[] }[],
) {
  memberships = memberships.filter((m) => m.user_id !== userId);
  for (const m of list) {
    for (const role of m.role_ids) {
      memberships.push({
        id: randomUUID(),
        user_id: userId,
        org_id: m.org_id,
        role_id: role,
        role_name: roleById(role)?.name ?? role,
        inherited: false,
        created_at: new Date().toISOString(),
      });
    }
  }
}

/** Danh sách cửa hàng công khai (`GET /organizations/public/stores`, cũng cho website). */
export function publicStores(): Profile[] {
  return [...profiles.values()]
    .filter((p) => p.public && units.find((u) => u.id === p.unit_id)?.status === "active")
    .sort((a, b) => a.position - b.position || a.display_name.localeCompare(b.display_name));
}

/** `true` khi đã trả lời. */
export async function orgRoutes(
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
  route: string,
): Promise<boolean> {
  const done = (status: number, body: unknown) => {
    send(response, status, body);
    return true;
  };
  const fail = (
    status: number,
    code: string,
    detail: string,
    errors?: Schemas["ProblemField"][],
  ) => {
    problem(response, status, code, detail, errors);
    return true;
  };
  if (route === "GET /api/v1/organizations/public/stores") {
    return done(200, { data: publicStores() });
  }
  if (route === "GET /api/v1/organizations/public/site") {
    // Như core (D-331): `?site=` chọn nút; không có thì nút gốc (core giả không gắn tên miền với nút).
    const site = url.searchParams.get("site") ?? ROOT_UNIT;
    const unit = units.find((u) => u.id === site && u.status === "active");
    if (!unit) return fail(404, "site_not_found", "No active unit with this id in this tenant.");
    return done(200, { data: profiles.get(unit.id) ?? profile(unit.id) });
  }
  if (route === "GET /api/v1/auth/memberships/counts") {
    // Như core (D-332): mỗi nút một dòng; `total` gồm người ở nút trên, mỗi người một lần.
    return done(200, {
      data: units.map((u) => {
        const above = new Set(chain(u.id).map((x) => x.id));
        const people = (ids: Set<string>) =>
          new Set(memberships.filter((m) => ids.has(m.org_id)).map((m) => m.user_id)).size;
        return { org_id: u.id, direct: people(new Set([u.id])), total: people(above) };
      }),
    });
  }
  if (route === "GET /api/v1/auth/memberships") {
    const org = url.searchParams.get("org_id");
    if (!org) return done(200, page(memberships, url));
    // Như core: chỉ tính membership ở nút trên khi có `inherited=true`.
    const above = new Set(
      url.searchParams.get("inherited") === "true" ? chain(org).map((u) => u.id) : [org],
    );
    const rows = memberships
      .filter((m) => above.has(m.org_id))
      .map((m) => ({ ...m, inherited: m.org_id !== org }));
    return done(200, page(rows, url));
  }
  if (route === "GET /api/v1/address/provinces") return done(200, { data: PROVINCES });
  const communes = /^\/api\/v1\/address\/provinces\/([^/]+)\/communes$/.exec(url.pathname);
  if (communes && request.method === "GET") {
    const code = communes[1] ?? "";
    if (!PROVINCES.some((x) => x.code === code)) {
      return fail(404, "address.unit_not_found", "No such administrative unit.");
    }
    return done(200, { data: COMMUNES.filter((c) => c.parent_code === code) });
  }
  if (!url.pathname.startsWith("/api/v1/organizations/")) return false;
  if (route === "GET /api/v1/organizations/unit-types") return done(200, { data: TYPES });
  if (route === "GET /api/v1/organizations/settings") return done(200, { data: CATALOG });
  if (route === "GET /api/v1/organizations/units") {
    const sorted = [...units].sort((a, b) => a.created_at.localeCompare(b.created_at));
    return done(200, page(sorted, url));
  }
  if (route === "POST /api/v1/organizations/units") {
    const body = (await json(request)) as Schemas["CreateUnitRequest"];
    const errors: Schemas["ProblemField"][] = [];
    if (!body.name?.trim()) errors.push({ field: "name", code: "required", detail: "is required" });
    if (!TYPES.some((type) => type.code === body.unit_type && type.code !== "tenant")) {
      errors.push({ field: "unit_type", code: "unknown", detail: "is not a unit type" });
    }
    if (errors.length > 0) {
      return fail(422, "validation_failed", "The request has invalid fields.", errors);
    }
    if (!units.some((u) => u.id === body.parent_id)) {
      return fail(404, "org_not_found", "No such organization unit.");
    }
    const code = body.code?.trim() || null;
    if (code && units.some((u) => u.code?.toLowerCase() === code.toLowerCase())) {
      return fail(409, "organizations.unit_code_taken", `The code \`${code}\` is already in use.`);
    }
    const created = unit(randomUUID(), body.parent_id, body.unit_type, body.name.trim());
    created.code = code;
    units.push(created);
    return done(201, { data: created });
  }
  const match = /^\/api\/v1\/organizations\/units\/([^/]+)(\/.*)?$/.exec(url.pathname);
  if (!match) return fail(404, "not_found", "No such route in the mock core.");
  const id = match[1] ?? "";
  const rest = match[2] ?? "";
  const found = units.find((u) => u.id === id);
  if (!found) return fail(404, "org_not_found", "No such organization unit.");
  const method = request.method ?? "GET";
  if (method === "GET" && rest === "") return done(200, { data: found });
  if (method === "POST" && rest === "/status") {
    const body = (await json(request)) as Schemas["UnitStatusRequest"];
    if (found.parent_id === null) {
      return fail(409, "org_root_immutable", "The root unit cannot be changed this way.");
    }
    found.status = body.status;
    found.status_reason = body.reason ?? null;
    found.updated_at = at();
    return done(200, { data: found });
  }
  if (method === "GET" && rest === "/settings") return done(200, { data: effective(id) });
  const setting = /^\/settings\/([^/]+)$/.exec(rest);
  if (setting) {
    const key = decodeURIComponent(setting[1] ?? "");
    if (!CATALOG.some((s) => s.key === key)) {
      return fail(404, "organizations.setting_unknown", `No setting named \`${key}\`.`);
    }
    if (method === "PUT") {
      const body = (await json(request)) as { value?: unknown };
      if (key === "organizations.currency" && !/^[A-Z]{3}$/.test(String(body.value ?? ""))) {
        return fail(422, "organizations.setting_invalid", "must be an ISO 4217 code, e.g. `VND`");
      }
      values.set(`${id}|${key}`, body.value);
    } else if (method === "DELETE") {
      values.delete(`${id}|${key}`);
    }
    const now = effective(id).find((s) => s.key === key);
    return done(200, { data: now });
  }
  if (rest === "/public-profile") {
    if (method === "PATCH") {
      const body = (await json(request)) as Schemas["PublicProfileRequest"];
      const current = profile(id);
      const errors: Schemas["ProblemField"][] = [];
      const address = body.address;
      if (
        address &&
        !COMMUNES.some(
          (c) => c.code === address.commune_code && c.parent_code === address.province_code,
        )
      ) {
        errors.push({
          field: "address.commune_code",
          code: "not_in_province",
          detail: "is not a commune of this province",
        });
      }
      for (const [index, range] of (body.opening_hours ?? []).entries()) {
        if (range.closes <= range.opens) {
          errors.push({
            field: `opening_hours[${index}].closes`,
            code: "before_opens",
            detail: "must be after the opening time",
          });
        }
      }
      if (errors.length > 0) {
        return fail(
          422,
          address && errors[0]?.field.startsWith("address")
            ? "validation_failed"
            : "organizations.invalid_opening_hours",
          "Some fields are invalid.",
          errors,
        );
      }
      const next: Profile = {
        ...current,
        ...(body.public !== undefined && body.public !== null ? { public: body.public } : {}),
        ...(body.pickup !== undefined && body.pickup !== null ? { pickup: body.pickup } : {}),
        ...(body.display_name !== undefined
          ? { display_name: body.display_name ?? found.name }
          : {}),
        ...(body.opening_hours ? { opening_hours: body.opening_hours } : {}),
        ...(body.address !== undefined
          ? {
              address: body.address
                ? {
                    ...body.address,
                    province_name:
                      PROVINCES.find((x) => x.code === body.address?.province_code)?.name ?? "",
                    commune_name:
                      COMMUNES.find((x) => x.code === body.address?.commune_code)?.name ?? "",
                  }
                : null,
            }
          : {}),
        updated_at: at(),
      };
      profiles.set(id, next);
      return done(200, { data: next });
    }
    return done(200, { data: profile(id) });
  }
  return fail(404, "not_found", "No such route in the mock core.");
}
