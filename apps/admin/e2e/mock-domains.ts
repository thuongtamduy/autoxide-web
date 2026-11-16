// Tên miền riêng của khách (bước 33 C1 của core, D-291 / D-293) cho core giả. Hình dạng theo
// `openapi.json` (`satisfies` kiểu của SDK). Luật như core:
// - chỉ admin (mọi permission) — người khác 403 `permission_denied` (`kernel.domains.manage`);
// - bản cài một khách (`single`): thêm tên miền → 409 `tenant_single_mode`;
// - chuẩn hoá chữ thường, bỏ cổng và dấu chấm cuối; IP, `localhost`, tên một nhãn → 422
//   `tenant_domain_invalid`; `taken.example` là của khách khác → 409 `tenant_domain_taken`;
// - thêm lại tên miền đang có trả chính nó (201); gỡ → `revoked` (không còn trong danh sách);
// - "Kiểm tra ngay" luôn 200: chưa có bản ghi thì `check_error` nói lý do. Không có DNS thật:
//   `POST /__domains/dns {"domain": "…"}` đặt bản ghi TXT đúng cho tên miền đó (lần kiểm sau
//   thành `verified`).
import { randomBytes, randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { type Account, empty, json, problem, type Schemas, send, text } from "./mock-http.ts";
import { tenancyMode } from "./mock-tenants.ts";

type Domain = Schemas["TenantDomain"];

let domains: (Domain & { revoked: boolean })[] = [];
let records = new Set<string>();

export function resetDomains() {
  domains = [];
  records = new Set();
}

/** Chuẩn hoá như `normalize_domain` của core; `null` khi không dùng được. */
function normalize(raw: string): string | null {
  let name = raw.trim().toLowerCase();
  name = name.replace(/:\d+$/, "").replace(/\.$/, "");
  if (!name || name.length > 253 || !name.includes(".")) return null;
  const labels = name.split(".");
  const ok = labels.every((l) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(l));
  const tld = labels.at(-1) ?? "";
  if (!ok || /^\d+$/.test(tld) || name === "localhost" || name.endsWith(".localhost")) return null;
  return name;
}

function public_(domain: Domain & { revoked: boolean }): Domain {
  const { revoked: _revoked, ...rest } = domain;
  return rest;
}

/** `POST /__domains/dns {domain}`: bản ghi TXT của tên miền đã đặt đúng. */
export async function setDnsRecord(request: IncomingMessage, response: ServerResponse) {
  records.add(text(await json(request), "domain"));
  send(response, 204);
}

/** `/api/v1/kernel/domains…`. Trả `true` khi đã trả lời. */
export async function domainRoutes(
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
  account: Account,
): Promise<boolean> {
  const path = url.pathname;
  if (path !== "/api/v1/kernel/domains" && !path.startsWith("/api/v1/kernel/domains/")) {
    return false;
  }
  const method = request.method ?? "GET";
  if (!account.canReadModules) {
    problem(response, 403, "permission_denied", "Missing permission `kernel.domains.manage`.");
    return true;
  }
  if (path === "/api/v1/kernel/domains" && method === "GET") {
    const list = domains.filter((d) => !d.revoked).map(public_);
    send(response, 200, {
      data: list,
      pagination: { limit: Number(url.searchParams.get("limit") ?? 50), next_cursor: null },
    } satisfies Schemas["Page_TenantDomain"]);
    return true;
  }
  if (path === "/api/v1/kernel/domains" && method === "POST") {
    if (tenancyMode() === "single") {
      problem(
        response,
        409,
        "tenant_single_mode",
        "This installation runs in single-tenant mode; set AUTOXIDE_TENANCY_MODE=multi to add tenants.",
      );
      return true;
    }
    const raw = text(await json(request), "domain");
    const name = normalize(raw);
    if (!name) {
      problem(
        response,
        422,
        "tenant_domain_invalid",
        `\`${raw.slice(0, 100)}\` is not a domain that can be used: send a name such as \`shop.example\` (punycode for international names), not an IP address, \`localhost\` or the platform's own domain.`,
      );
      return true;
    }
    if (name === "taken.example") {
      problem(
        response,
        409,
        "tenant_domain_taken",
        `The domain \`${name}\` belongs to another tenant.`,
      );
      return true;
    }
    const existing = domains.find((d) => d.domain === name && !d.revoked);
    if (existing) {
      send(response, 201, { data: public_(existing) } satisfies Schemas["Data_TenantDomain"]);
      return true;
    }
    const now = new Date().toISOString();
    const created = {
      id: randomUUID(),
      domain: name,
      status: "pending",
      record: {
        type: "TXT",
        name: `_autoxide-challenge.${name}`,
        value: `autoxide-verify=${randomBytes(24).toString("base64url")}`,
      },
      failed_checks: 0,
      org_id: null,
      verified_at: null,
      last_checked_at: null,
      check_error: null,
      created_at: now,
      updated_at: now,
      revoked: false,
    };
    domains.unshift(created);
    response.setHeader("Location", `/api/v1/kernel/domains/${created.id}`);
    send(response, 201, { data: public_(created) } satisfies Schemas["Data_TenantDomain"]);
    return true;
  }
  const match = path.match(/^\/api\/v1\/kernel\/domains\/([^/]+)(\/verify)?$/);
  const found = match ? domains.find((d) => d.id === match[1] && !d.revoked) : undefined;
  if (!match || !found) {
    problem(
      response,
      404,
      "tenant_domain_not_found",
      "This domain is not one of the current tenant's domains.",
    );
    return true;
  }
  if (match[2] && method === "POST") {
    const now = new Date().toISOString();
    if (found.status === "verified" && found.failed_checks === 0) {
      send(response, 200, { data: public_(found) } satisfies Schemas["Data_TenantDomain"]);
      return true;
    }
    found.last_checked_at = now;
    if (records.has(found.domain)) {
      found.status = "verified";
      found.verified_at = now;
      found.updated_at = now;
      found.check_error = null;
      found.failed_checks = 0;
    } else {
      found.check_error = `No TXT record found at ${found.record.name}.`;
      if (found.status === "failed") {
        found.status = "pending";
        found.updated_at = now;
      }
    }
    send(response, 200, { data: public_(found) } satisfies Schemas["Data_TenantDomain"]);
    return true;
  }
  if (!match[2] && method === "PATCH") {
    // Gắn tên miền với nút (D-297 của core): chưa có module `organizations` (bước 34) nên core chỉ
    // nhận `null`; thiếu `org_id` hay nêu một nút → 422 lỗi ô `org_id`.
    const body = await json(request);
    if (!("org_id" in body) || body.org_id !== null) {
      problem(response, 422, "validation_failed", "The request has invalid fields.", [
        {
          field: "org_id",
          code: "org_id" in body ? "unsupported" : "required",
          detail:
            "org_id" in body
              ? "this installation has no organization tree yet; only `null` is accepted"
              : "is required; send `null` to detach",
        },
      ]);
      return true;
    }
    found.org_id = null;
    send(response, 200, { data: public_(found) } satisfies Schemas["Data_TenantDomain"]);
    return true;
  }
  if (!match[2] && method === "DELETE") {
    found.revoked = true;
    empty(response, 204);
    return true;
  }
  return false;
}
