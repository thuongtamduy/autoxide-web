// Module `plans` của core giả (bước 35 của core): gói và giá, thuê bao của khách đang đăng nhập (phía
// khách) và của mọi khách (phía nhân sự nền tảng), hạn mức, kỳ thanh toán, ghi đè theo khách. Hình
// dạng theo `openapi.json`; luật rút gọn: gói đắt hơn (theo tháng) có hiệu lực ngay, rẻ hơn chờ hết
// kỳ; ghi đè thay ghi đè cùng loại và khoá.
import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { empty, json, problem, type Schemas, send } from "./mock-http.ts";

type Plan = Schemas["PlanResponse"];
type Subscription = Schemas["PlanSubscription"];

/** Khách của tài khoản giả (khách nền tảng `default`, cùng id với `mock-tenants.ts`). */
export const OWN_TENANT = "00000000-0000-7000-8000-000000000001";
const BASIC = "01a1e500-0000-7000-8000-0000000000a1";
const PRO = "01a1e500-0000-7000-8000-0000000000a2";
const BASIC_MONTH = "01a1e500-0000-7000-8000-0000000000b1";
const PRO_MONTH = "01a1e500-0000-7000-8000-0000000000b2";
const PRO_YEAR = "01a1e500-0000-7000-8000-0000000000b3";

let plans: Plan[] = [];
let subscriptions: Subscription[] = [];
let periods: Schemas["BillingPeriodResponse"][] = [];
let overrides = new Map<string, Schemas["OverrideResponse"][]>();
let suspended = new Map<string, string>();

const AT = "2026-11-01T00:00:00Z";

function price(id: string, amount: number, interval: string): Schemas["PriceResponse"] {
  return {
    id,
    kind: "recurring",
    interval,
    interval_count: 1,
    included: 0,
    active: true,
    amount: { amount: String(amount), currency: "VND" },
    limit_key: null,
    created_at: AT,
  };
}

function plan(fields: Partial<Plan> & Pick<Plan, "id" | "code" | "name">): Plan {
  return {
    description: "",
    kind: "base",
    status: "active",
    is_default: false,
    modules: ["content", "media", "forms"],
    features: [],
    limits: { "auth.members": 5, "organizations.units": 3, "files.storage_bytes": 1_073_741_824 },
    prices: [],
    trial_days: 14,
    grace_days: 7,
    suspend_days: 30,
    retention_days: 90,
    renewal_lead_days: 7,
    placement: "shared",
    requires_kyc: false,
    sample_data: false,
    created_at: AT,
    updated_at: AT,
    ...fields,
  };
}

export function resetPlans() {
  plans = [
    plan({
      id: BASIC,
      code: "co-ban",
      name: "Cơ bản",
      is_default: true,
      prices: [price(BASIC_MONTH, 290_000, "month")],
    }),
    plan({
      id: PRO,
      code: "pro",
      name: "Pro",
      features: ["auth.api_keys", "content.ai_suggestions"],
      limits: { "auth.members": 50, "organizations.units": null, "files.storage_bytes": null },
      prices: [price(PRO_MONTH, 990_000, "month"), price(PRO_YEAR, 9_900_000, "year")],
    }),
  ];
  subscriptions = [
    {
      id: "01a1e500-0000-7000-8000-0000000000c1",
      tenant_id: OWN_TENANT,
      plan_id: BASIC,
      price_id: BASIC_MONTH,
      status: "active",
      addons: [],
      cancel_at_period_end: false,
      canceled_at: null,
      current_period_start: "2026-11-01T00:00:00Z",
      current_period_end: "2026-12-01T00:00:00Z",
      delete_after: null,
      grace_ends_at: null,
      scheduled_plan_id: null,
      scheduled_price_id: null,
      suspended_at: null,
      trial_ends_at: null,
      trial_used: true,
      created_at: AT,
      updated_at: AT,
    },
  ];
  periods = [
    period("01a1e500-0000-7000-8000-0000000000d1", "paid", "2026-10-01", "2026-11-01"),
    period("01a1e500-0000-7000-8000-0000000000d2", "open", "2026-11-01", "2026-12-01"),
  ];
  overrides = new Map();
  suspended = new Map();
}
resetPlans();

function period(id: string, status: string, start: string, end: string) {
  return {
    id,
    tenant_id: OWN_TENANT,
    plan_id: BASIC,
    price_id: BASIC_MONTH,
    kind: "renewal",
    status,
    amount: { amount: "290000", currency: "VND" },
    period_start: `${start}T00:00:00Z`,
    period_end: `${end}T00:00:00Z`,
    due_at: `${start}T00:00:00Z`,
    paid_at: status === "paid" ? `${start}T08:00:00Z` : null,
    invoice_number: status === "paid" ? "AX-2610-0001" : null,
    provider_reference: null,
    reference: `plans:${id}:${start}:renewal`,
    created_at: AT,
  };
}

/** Mức dùng hạn mức của khách: tính từ gói đang dùng và ghi đè. */
function usage(tenant: string): Schemas["LimitUse"][] {
  const sub = subscriptions.find((s) => s.tenant_id === tenant);
  const current = plans.find((p) => p.id === sub?.plan_id);
  const limits = { ...((current?.limits ?? {}) as Record<string, number | null>) };
  for (const o of overrides.get(tenant) ?? []) {
    if (o.kind === "limit") limits[o.key] = o.max_value ?? null;
  }
  const used: Record<string, number> = {
    "auth.members": 4,
    "organizations.units": 4,
    "files.storage_bytes": 268_435_456,
    "kernel.api_requests": 12_000,
  };
  return Object.entries(used).map(([key, value]) => {
    const max = key in limits ? (limits[key] ?? null) : key === "kernel.api_requests" ? null : 0;
    return {
      key,
      kind: key === "kernel.api_requests" ? "metered" : key.endsWith("bytes") ? "amount" : "count",
      used: value,
      max,
      over_limit: max !== null && value > max,
    };
  });
}

function monthly(priceId: string | null | undefined): number {
  const found = plans.flatMap((p) => p.prices).find((p) => p.id === priceId);
  if (!found) return 0;
  return Number(found.amount.amount) / (found.interval === "year" ? 12 : 1);
}

function page<T>(data: T[]) {
  return { data, pagination: { limit: 200, next_cursor: null } };
}

function validPlan(body: Schemas["PlanRequest"]): Schemas["ProblemField"][] {
  const errors: Schemas["ProblemField"][] = [];
  if (!/^[a-z][a-z0-9_-]{0,63}$/.test(body.code ?? "")) {
    errors.push({ field: "code", code: "format", detail: "must match [a-z][a-z0-9_-]{0,63}" });
  }
  const known = [
    "auth.members",
    "organizations.units",
    "files.storage_bytes",
    "kernel.api_requests",
  ];
  const unknown = Object.keys(body.limits ?? {}).filter((key) => !known.includes(key));
  if (unknown.length > 0) {
    errors.push({
      field: "limits",
      code: "unknown",
      detail: `unknown limit: ${unknown.join(", ")}`,
    });
  }
  return errors;
}

/** `true` khi đã trả lời. */
export async function plansRoutes(
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
  route: string,
): Promise<boolean> {
  const path = url.pathname;
  if (!path.startsWith("/api/v1/plans/")) return false;
  const method = request.method ?? "GET";
  const done = (status: number, body?: unknown) => {
    if (body === undefined) empty(response, 204);
    else send(response, status, body);
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
  const own = subscriptions.find((s) => s.tenant_id === OWN_TENANT);
  // ------------------------------------------------------------ Phía khách
  if (route === "GET /api/v1/plans/catalog") {
    return done(200, { data: plans.filter((p) => p.status === "active") });
  }
  if (route === "GET /api/v1/plans/usage") return done(200, { data: usage(OWN_TENANT) });
  if (route === "GET /api/v1/plans/billing-periods") {
    return done(200, {
      data: [...periods].sort((a, b) => b.period_start.localeCompare(a.period_start)),
    });
  }
  if (route === "GET /api/v1/plans/entitlements") {
    const current = plans.find((p) => p.id === own?.plan_id);
    return done(200, {
      data: {
        access: own && ["suspended", "canceled"].includes(own.status) ? "read_only" : "full",
        modules: current?.modules ?? [],
        features: current?.features ?? [],
        limits: usage(OWN_TENANT),
        unrestricted: !current,
      },
    });
  }
  if (route === "GET /api/v1/plans/subscription") {
    if (!own) return fail(404, "plans.subscription_not_found", "This tenant has no subscription.");
    return done(200, { data: own });
  }
  if (route === "POST /api/v1/plans/subscription/change") {
    const body = (await json(request)) as Schemas["ChangeRequest"];
    const target = plans.find((p) => p.id === body.plan_id && p.status === "active");
    if (!own || !target?.prices.some((p) => p.id === body.price_id && p.active)) {
      return fail(404, "plans.plan_not_found", "No active plan or price with this id.");
    }
    if (monthly(body.price_id) >= monthly(own.price_id)) {
      own.plan_id = target.id;
      own.price_id = body.price_id ?? null;
      own.scheduled_plan_id = null;
      own.scheduled_price_id = null;
    } else {
      own.scheduled_plan_id = target.id;
      own.scheduled_price_id = body.price_id ?? null;
    }
    return done(200, { data: own });
  }
  if (route === "POST /api/v1/plans/subscription/cancel") {
    if (!own) return fail(404, "plans.subscription_not_found", "This tenant has no subscription.");
    own.cancel_at_period_end = true;
    return done(200, { data: own });
  }
  if (route === "POST /api/v1/plans/subscription/resume") {
    if (!own) return fail(404, "plans.subscription_not_found", "This tenant has no subscription.");
    own.cancel_at_period_end = false;
    return done(200, { data: own });
  }
  // ------------------------------------------------------------ Phía nền tảng: gói
  if (route === "GET /api/v1/plans/plans") return done(200, page(plans));
  if (route === "POST /api/v1/plans/plans") {
    const body = (await json(request)) as Schemas["PlanRequest"];
    const errors = validPlan(body);
    if (errors.length > 0)
      return fail(422, "validation_failed", "The request has invalid fields.", errors);
    if (plans.some((p) => p.code === body.code)) {
      return fail(409, "plans.plan_code_taken", `A plan with the code \`${body.code}\` exists.`);
    }
    const created = plan({
      id: randomUUID(),
      code: body.code,
      name: body.name,
      description: body.description ?? "",
      kind: body.kind ?? "base",
      status: body.status ?? "draft",
      modules: body.modules ?? [],
      features: body.features ?? [],
      limits: body.limits ?? {},
      trial_days: body.trial_days ?? 0,
      placement: body.placement ?? "shared",
    });
    plans.push(created);
    return done(201, { data: created });
  }
  if (route === "GET /api/v1/plans/subscriptions") {
    const status = url.searchParams.get("status");
    const planId = url.searchParams.get("plan_id");
    // Thuê bao của khách giả `OWN_TENANT` chỉ để thử phía khách; danh sách của nền tảng không có nó
    // (khách nền tảng không có thuê bao ở core).
    return done(
      200,
      page(
        subscriptions.filter(
          (s) =>
            s.tenant_id !== OWN_TENANT &&
            (!status || s.status === status) &&
            (!planId || s.plan_id === planId),
        ),
      ),
    );
  }
  const priceOff = /^\/api\/v1\/plans\/prices\/([^/]+)\/deactivate$/.exec(path);
  if (priceOff && method === "POST") {
    const owner = plans.find((p) => p.prices.some((x) => x.id === priceOff[1]));
    const found = owner?.prices.find((x) => x.id === priceOff[1]);
    if (!owner || !found) return fail(404, "plans.price_not_found", "No price with this id.");
    found.active = false;
    return done(200, { data: owner });
  }
  const one = /^\/api\/v1\/plans\/plans\/([^/]+)(\/prices|\/retire)?$/.exec(path);
  if (one) {
    const found = plans.find((p) => p.id === one[1]);
    if (!found) return fail(404, "plans.plan_not_found", "No plan with this id.");
    if (method === "GET" && !one[2]) return done(200, { data: found });
    if (method === "PUT" && !one[2]) {
      const body = (await json(request)) as Schemas["PlanRequest"];
      const errors = validPlan(body);
      if (errors.length > 0)
        return fail(422, "validation_failed", "The request has invalid fields.", errors);
      if (body.is_default) for (const p of plans) p.is_default = false;
      Object.assign(found, {
        name: body.name,
        description: body.description ?? "",
        modules: body.modules ?? [],
        features: body.features ?? [],
        limits: body.limits ?? {},
        trial_days: body.trial_days ?? 0,
        placement: body.placement ?? "shared",
        status: found.status === "retired" ? "retired" : (body.status ?? found.status),
        is_default: body.is_default ?? found.is_default,
        updated_at: new Date().toISOString(),
      });
      return done(200, { data: found });
    }
    if (method === "POST" && one[2] === "/retire") {
      found.status = "retired";
      found.is_default = false;
      return done(200, { data: found });
    }
    if (method === "POST" && one[2] === "/prices") {
      const body = (await json(request)) as Schemas["PriceRequest"];
      found.prices.push({
        ...price(randomUUID(), Number(body.amount.amount), body.interval),
        amount: body.amount,
        created_at: new Date().toISOString(),
      });
      return done(201, { data: found });
    }
  }
  // ------------------------------------------------------------ Phía nền tảng: một khách
  const tenant =
    /^\/api\/v1\/plans\/tenants\/([^/]+)\/(overrides|subscription|usage)(?:\/([^/]+))?$/.exec(path);
  if (tenant) {
    const id = tenant[1] ?? "";
    // Như core: khách nền tảng không bao giờ bị giới hạn theo gói (không thuê bao, không ghi đè).
    if (id === OWN_TENANT && method !== "GET") {
      return fail(
        422,
        "plans.platform_exempt",
        "The platform tenant is never limited by a plan: it has no subscription or overrides.",
      );
    }
    const part = tenant[2];
    const tail = tenant[3];
    if (part === "usage") return done(200, { data: usage(id) });
    if (part === "overrides") {
      const list = overrides.get(id) ?? [];
      if (method === "GET") return done(200, { data: list });
      if (method === "POST") {
        const body = (await json(request)) as Schemas["OverrideRequest"];
        if (!(body.reason ?? "").trim()) {
          return fail(422, "validation_failed", "The request has invalid fields.", [
            { field: "reason", code: "length", detail: "must be 1 to 500 characters" },
          ]);
        }
        const entry = {
          id: randomUUID(),
          kind: body.kind,
          key: body.key,
          enabled: body.enabled ?? null,
          max_value: body.max_value ?? null,
          expires_at: body.expires_at ?? null,
          reason: body.reason,
          created_by: null,
          created_at: new Date().toISOString(),
        };
        overrides.set(id, [
          ...list.filter((o) => !(o.kind === entry.kind && o.key === entry.key)),
          entry,
        ]);
        return done(201, { data: entry });
      }
      if (method === "DELETE" && tail) {
        if (!list.some((o) => o.id === tail))
          return fail(404, "plans.override_not_found", "No such override.");
        overrides.set(
          id,
          list.filter((o) => o.id !== tail),
        );
        return done(204);
      }
    }
    if (part === "subscription") {
      const sub = subscriptions.find((s) => s.tenant_id === id);
      if (method === "GET" && !tail) {
        if (!sub)
          return fail(404, "plans.subscription_not_found", "This tenant has no subscription.");
        return done(200, { data: sub });
      }
      if (method === "PUT" && !tail) {
        const body = (await json(request)) as Schemas["AssignRequest"];
        const target = plans.find((p) => p.id === body.plan_id && p.status === "active");
        if (!target) return fail(404, "plans.plan_not_found", "No active plan with this id.");
        if (sub) {
          sub.plan_id = target.id;
          sub.price_id = body.price_id ?? null;
          sub.status = "active";
          return done(200, { data: sub });
        }
        const created = {
          ...(subscriptions[0] as Subscription),
          id: randomUUID(),
          tenant_id: id,
          plan_id: target.id,
          price_id: body.price_id ?? null,
          status: target.trial_days > 0 ? "trialing" : "active",
        };
        subscriptions.push(created);
        return done(200, { data: created });
      }
      if (method === "POST" && tail === "cancel") {
        if (!sub)
          return fail(404, "plans.subscription_not_found", "This tenant has no subscription.");
        sub.status = "canceled";
        sub.canceled_at = new Date().toISOString();
        return done(200, { data: sub });
      }
      if (method === "POST" && tail === "suspend") {
        const body = (await json(request)) as Schemas["SuspendRequest"];
        if (!(body.reason ?? "").trim()) {
          return fail(422, "validation_failed", "The request has invalid fields.", [
            { field: "reason", code: "length", detail: "must be 1 to 500 characters" },
          ]);
        }
        suspended.set(id, body.reason);
        return done(204);
      }
    }
  }
  return fail(404, "not_found", "No such route in the mock core.");
}
