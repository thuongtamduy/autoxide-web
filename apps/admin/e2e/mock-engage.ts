// Phân hệ Tiếp thị (biểu mẫu, bản tin, bình luận) cho core giả. Hình dạng theo `openapi.json`
// (`satisfies` kiểu của SDK). Luật như core:
// - lệnh sửa (form, bài nộp, danh sách, người đăng ký, chiến dịch, bình luận) bắt buộc `If-Match`
//   (thiếu: 428 `precondition_required`; cũ: 412 `precondition_failed`); ETag = `W/"<updated_at>"`;
// - mã form / danh sách trùng: 409 `forms.key_taken` / `newsletter.list_key_taken`;
// - định nghĩa form sai báo mọi lỗi một lần theo đường dẫn `fields[2].options`;
// - gửi thử / gửi ngay cần cấu hình gửi: chiến dịch có tiêu đề chứa "no-config" trả 503
//   `newsletter.preferences_url_missing`, để thử cách hiện lỗi.
//
// Có sẵn: form "Liên hệ" (3 bài nộp), danh sách "Bản tin tuần" (2 người), chiến dịch nháp, hai
// bình luận chờ duyệt trên `demo.page/ve-sinh-thot-go`.
import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { ModuleInfo } from "@autoxide/sdk";
import { empty, json, problem, type Schemas, send, text } from "./mock-http.ts";

type Form = Schemas["FormResponse"];
type Submission = Schemas["SubmissionResponse"];
type List = Schemas["ListResponse"];
type Subscriber = Schemas["SubscriberResponse"];
type Suppression = Schemas["SuppressionResponse"];
type Campaign = Schemas["CampaignResponse"];
type Comment = Schemas["CommentDetail"];
type Ban = Schemas["CommentBan"];
type Target = Schemas["CommentTarget"];

function module(name: string, position: number, permissions: string[]): ModuleInfo {
  return {
    name,
    internal: false,
    position,
    permissions: permissions.map((p) => ({
      name: `${name}.${p}`,
      description: p,
      risk: p === "read" ? "read" : "write",
    })),
    events: [],
    subscriptions: [],
    jobs: [],
    schedules: [],
    tools: [],
    deprecations: [],
    languages: ["vi"],
    migrations: [{ name: "m0001_init", applied: true }],
  };
}

export const ENGAGE_MODULES: ModuleInfo[] = [
  module("forms", 10, ["read", "manage", "review", "export"]),
  module("newsletter", 11, ["read", "manage", "send", "export"]),
  module("comments", 12, ["post", "read", "moderate", "manage", "export"]),
];

let clock = Date.parse("2026-11-15T00:00:00Z");
/** Mỗi lần ghi một thời điểm mới, để ETag đổi và thứ tự "mới trước" ổn định. */
function now(): string {
  clock += 1000;
  return new Date(clock).toISOString();
}

const etag = (updated: string) => `W/"${updated}"`;

let forms: Form[] = [];
let submissions: Submission[] = [];
let exports: Schemas["ExportResponse"][] = [];
let lists: List[] = [];
let subscribers: Subscriber[] = [];
let suppressions: Suppression[] = [];
let campaigns: Campaign[] = [];
let comments: Comment[] = [];
let bans: Ban[] = [];
let targets: Target[] = [];
let profile: string | null = null;

const answer = (key: string, type: Schemas["FieldType"], vi: string, value: unknown) => ({
  key,
  type,
  label: { vi },
  value: value as Submission["answers"][number]["value"],
});

export function resetEngage() {
  clock = Date.parse("2026-11-15T00:00:00Z");
  exports = [];
  const formId = randomUUID();
  const at = now();
  forms = [
    {
      id: formId,
      key: "lien-he",
      name: "Liên hệ",
      status: "open",
      version: 1,
      fields: [
        { key: "name", type: "text", label: { vi: "Họ tên", en: "Name" }, required: true },
        { key: "email", type: "email", label: { vi: "Email", en: "Email" }, required: true },
        {
          key: "topic",
          type: "select",
          label: { vi: "Chủ đề", en: "Topic" },
          options: [{ value: "hop-tac", label: { vi: "Hợp tác", en: "Partnership" } }],
        },
        { key: "message", type: "textarea", label: { vi: "Nội dung", en: "Message" } },
      ],
      notify_emails: ["cskh@example.com"],
      allowed_origins: [],
      reply_to_field: "email",
      retention_days: 365,
      success_message: { vi: "Cảm ơn bạn." },
      token_scope: "forms:lien-he",
      created_at: at,
      updated_at: at,
    } satisfies Form,
  ];
  const sub = (name: string, email: string, message: string): Submission => {
    const t = now();
    return {
      id: randomUUID(),
      form_id: formId,
      form_key: "lien-he",
      form_version: 1,
      status: "new",
      email,
      data: {},
      answers: [
        answer("name", "text", "Họ tên", name),
        answer("email", "email", "Email", email),
        answer("topic", "select", "Chủ đề", "hop-tac"),
        answer("message", "textarea", "Nội dung", message),
      ],
      locale: "vi",
      page_url: "https://shop.example.com/lien-he",
      ip_fingerprint: "jCQbbWCCA",
      created_at: t,
      updated_at: t,
    };
  };
  submissions = [
    sub("Lý Minh Châu", "chau@example.com", "Đơn BM-2611-0412 khi nào tới?"),
    sub("Hồ Gia Bảo", "bao@example.com", "Muốn nhập chảo gang về bán ở Đà Nẵng."),
    sub("Phan Mỹ Duyên", "duyen@example.com", "Cần 40 bộ dao bếp làm quà Tết."),
  ];
  const listId = randomUUID();
  const lt = now();
  lists = [
    {
      id: listId,
      key: "ban-tin-tuan",
      name: { vi: "Bản tin tuần", en: "Weekly" },
      description: { vi: "Mẹo bếp mỗi tuần." },
      double_opt_in: true,
      public: true,
      new_posts: "draft",
      new_post_locale: "vi",
      subscriptions: { confirmed: 1, unconfirmed: 1, unsubscribed: 0 },
      created_at: lt,
      updated_at: lt,
    } satisfies List,
  ];
  const person = (email: string, status: Schemas["SubscriptionStatus"]): Subscriber => {
    const t = now();
    return {
      id: randomUUID(),
      email,
      name: null,
      locale: "vi",
      status: "active",
      attributes: {},
      soft_bounces: 0,
      suppressed: null,
      subscriptions: [
        {
          list_id: listId,
          list_key: "ban-tin-tuan",
          status,
          requested_at: t,
          confirmed_at: status === "confirmed" ? t : null,
          consent: { source: "footer", text: "Nhận bản tin tuần.", at: t } as never,
        },
      ],
      created_at: t,
      updated_at: t,
    };
  };
  subscribers = [person("hanh@example.com", "confirmed"), person("thu@example.com", "unconfirmed")];
  suppressions = [];
  const ct = now();
  campaigns = [
    {
      id: randomUUID(),
      list_id: listId,
      subject: "Bản tin tuần 46",
      preheader: null,
      body_text: "Chào bạn,\nTuần này: vệ sinh thớt gỗ.",
      body_html: null,
      advertising: false,
      locale: "vi",
      status: "draft",
      progress: { total: 0, sent: 0, failed: 0, skipped: 0, pending: 0 },
      created_at: ct,
      updated_at: ct,
    } satisfies Campaign,
  ];
  const comment = (author: string, body: string, reason: string): Comment => {
    const t = now();
    const id = randomUUID();
    return {
      id,
      root_id: id,
      target_type: "demo.page",
      target_id: "ve-sinh-thot-go",
      author_kind: "guest",
      author_name: author,
      author_email: `${author.split(" ")[0]?.toLowerCase()}@example.com`,
      email_verified: false,
      badges: [],
      format: "text",
      body,
      body_html: body,
      status: "pending",
      hold_reason: reason,
      ip_fingerprint: "ip:7c21",
      locale: "vi",
      reply_count: 0,
      report_count: 0,
      created_at: t,
      updated_at: t,
    };
  };
  comments = [
    comment("Minh Trí", "Mua dầu lau thớt ở đâu?", "too_many_links"),
    comment("Thu Hà", "Thớt bị nứt sau khi ngâm nước qua đêm.", "first_comment"),
  ];
  bans = [];
  targets = [];
  profile = null;
}

resetEngage();

function page<T extends { id: string }>(items: T[], url: URL) {
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 50) || 50, 200);
  const cursor = url.searchParams.get("cursor");
  const start = cursor ? items.findIndex((i) => i.id === cursor) + 1 : 0;
  const data = items.slice(start, start + limit);
  const more = start + limit < items.length;
  return { data, pagination: { limit, next_cursor: more ? (data.at(-1)?.id ?? null) : null } };
}

/** Kiểm `If-Match`: trả `true` khi đã trả lời lỗi. */
function stale(
  request: IncomingMessage,
  response: ServerResponse,
  updated: string,
  required = true,
): boolean {
  const sent = request.headers["if-match"];
  if (!sent) {
    if (!required) return false;
    problem(response, 428, "precondition_required", "Send If-Match with the ETag you read.");
    return true;
  }
  if (sent !== "*" && sent !== etag(updated)) {
    problem(response, 412, "precondition_failed", "The record changed since you read it.");
    return true;
  }
  return false;
}

function tagged(response: ServerResponse, status: number, body: unknown, updated: string) {
  response.setHeader("ETag", etag(updated));
  send(response, status, body);
}

function notFound(response: ServerResponse, code: string) {
  problem(response, 404, code, "Not found.");
}

const KEY = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** Kiểm định nghĩa form như core: báo mọi lỗi một lần, đường dẫn `fields[i].…`. */
function formErrors(body: Record<string, unknown>): Schemas["ProblemField"][] {
  const errors: Schemas["ProblemField"][] = [];
  if (!text(body, "name"))
    errors.push({ field: "name", code: "length", detail: "1 to 200 characters" });
  if (!KEY.test(text(body, "key")))
    errors.push({
      field: "key",
      code: "format",
      detail: "lower-case letters and digits joined by -",
    });
  const fields = Array.isArray(body.fields) ? (body.fields as Schemas["Field"][]) : [];
  if (fields.length === 0)
    errors.push({ field: "fields", code: "length", detail: "1 to 50 fields" });
  const keys = new Set<string>();
  fields.forEach((f, i) => {
    if (keys.has(f.key))
      errors.push({
        field: `fields[${i}].key`,
        code: "unique",
        detail: "is already used by another field",
      });
    keys.add(f.key);
    if (["select", "radio", "checkbox"].includes(f.type) && !(f.options?.length ?? 0)) {
      errors.push({
        field: `fields[${i}].options`,
        code: "length",
        detail: "must have 1 to 100 options",
      });
    }
  });
  return errors;
}

export async function engageRoutes(
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
  route: string,
): Promise<boolean> {
  const path = url.pathname;
  if (!/^\/api\/v1\/(forms|newsletter|comments)(\/|$)/.test(path)) return false;
  const method = request.method ?? "GET";
  const seg = path.split("/").slice(3); // [module, ...]

  // ------------------------------------------------------------ forms
  if (route === "GET /api/v1/forms") {
    const status = url.searchParams.get("status");
    send(
      response,
      200,
      page(
        forms.filter((f) => !status || f.status === status),
        url,
      ) satisfies Schemas["Page_FormResponse"],
    );
    return true;
  }
  if (route === "POST /api/v1/forms") {
    const body = await json(request);
    const errors = formErrors(body);
    if (errors.length) {
      problem(response, 422, "validation_failed", "The request has invalid fields.", errors);
      return true;
    }
    if (forms.some((f) => f.key === text(body, "key"))) {
      problem(response, 409, "forms.key_taken", "This key is already used by another form.");
      return true;
    }
    const t = now();
    const form: Form = {
      id: randomUUID(),
      key: text(body, "key"),
      name: text(body, "name"),
      status: body.status === "closed" ? "closed" : "open",
      version: 1,
      fields: body.fields as Schemas["Field"][],
      notify_emails: (body.notify_emails as string[]) ?? [],
      allowed_origins: (body.allowed_origins as string[]) ?? [],
      reply_to_field: (body.reply_to_field as string | null) ?? null,
      retention_days: (body.retention_days as number | null) ?? null,
      success_message: (body.success_message as Schemas["Localized"]) ?? {},
      token_scope: `forms:${text(body, "key")}`,
      created_at: t,
      updated_at: t,
    };
    forms.unshift(form);
    send(response, 201, { data: form } satisfies Schemas["Data_FormResponse"]);
    return true;
  }
  if (route === "GET /api/v1/forms/data" || route === "DELETE /api/v1/forms/data") {
    const email = (url.searchParams.get("email") ?? "").toLowerCase();
    const found = submissions.filter((s) => s.email === email);
    if (method === "DELETE") {
      submissions = submissions.filter((s) => s.email !== email);
      send(response, 200, {
        data: { deleted: found.length },
      } satisfies Schemas["Data_ErasedResponse"]);
    } else {
      send(response, 200, {
        data: { email, submissions: found },
      } satisfies Schemas["Data_EmailDataResponse"]);
    }
    return true;
  }
  if (seg[0] === "forms" && seg[1] === "submissions" && seg[2]) {
    const sub = submissions.find((s) => s.id === seg[2]);
    if (!sub) {
      notFound(response, "forms.submission_not_found");
      return true;
    }
    if (method === "GET") tagged(response, 200, { data: sub }, sub.updated_at);
    else if (method === "PATCH") {
      if (stale(request, response, sub.updated_at)) return true;
      const body = await json(request);
      sub.status = body.status as Schemas["SubmissionStatus"];
      sub.updated_at = now();
      tagged(
        response,
        200,
        { data: sub } satisfies Schemas["Data_SubmissionResponse"],
        sub.updated_at,
      );
    } else if (method === "DELETE") {
      submissions = submissions.filter((s) => s !== sub);
      empty(response, 204);
    }
    return true;
  }
  if (seg[0] === "forms" && seg[1] === "exports" && seg[2]) {
    const job = exports.find((x) => x.id === seg[2]);
    if (!job) {
      notFound(response, "forms.export_not_found");
      return true;
    }
    if (seg[3] === "file") {
      const form = forms.find((f) => f.id === job.form_id);
      if (url.searchParams.get("signature") !== "mock" || !form) {
        problem(response, 403, "forms.export_link_invalid", "The link is wrong or has expired.");
        return true;
      }
      response.writeHead(200, {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${form.key}-submissions.csv"`,
      });
      response.end(csvOf(form));
      return true;
    }
    if (job.state === "pending") {
      const form = forms.find((f) => f.id === job.form_id);
      Object.assign(job, {
        state: "ready",
        finished_at: now(),
        row_count: submissions.filter((s) => s.form_id === job.form_id).length,
        size: form ? Buffer.byteLength(csvOf(form)) : 0,
        expires_at: new Date(Date.now() + 24 * 3_600_000).toISOString(),
        download_expires_at: new Date(Date.now() + 600_000).toISOString(),
        download_url: `/api/v1/forms/exports/${job.id}/file?expires=9999999999&signature=mock`,
      });
    }
    send(response, 200, { data: job } satisfies Schemas["Data_ExportResponse"]);
    return true;
  }
  if (seg[0] === "forms" && seg[1]) {
    const form = forms.find((f) => f.id === seg[1]);
    if (!form) {
      notFound(response, "forms.not_found");
      return true;
    }
    if (seg[2] === "submissions" && seg[3] === "export") {
      response.writeHead(200, {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${form.key}-submissions.csv"`,
      });
      response.end(csvOf(form));
      return true;
    }
    // Xuất chạy nền (core bước 31): lượt xuất `pending`, lần đọc đầu thành `ready` (job giả chạy xong).
    if (seg[2] === "submissions" && seg[3] === "exports" && method === "POST") {
      if (exports.some((x) => x.form_id === form.id && x.state !== "ready")) {
        problem(
          response,
          409,
          "forms.export_in_progress",
          "The form already has an export running.",
        );
        return true;
      }
      const job: Schemas["ExportResponse"] = {
        id: randomUUID(),
        form_id: form.id,
        state: "pending",
        created_at: now(),
      };
      exports.push(job);
      response.setHeader("Location", `/api/v1/forms/exports/${job.id}`);
      send(response, 201, { data: job } satisfies Schemas["Data_ExportResponse"]);
      return true;
    }
    if (seg[2] === "submissions") {
      const status = url.searchParams.get("status");
      const q = (url.searchParams.get("q") ?? "").toLowerCase();
      const found = submissions
        .filter((s) => s.form_id === form.id)
        .filter((s) => (status ? s.status === status : s.status !== "spam"))
        .filter((s) => !q || s.answers.some((a) => String(a.value).toLowerCase().includes(q)))
        .reverse();
      send(response, 200, page(found, url) satisfies Schemas["Page_SubmissionResponse"]);
      return true;
    }
    if (method === "GET") tagged(response, 200, { data: form }, form.updated_at);
    else if (method === "PATCH") {
      if (stale(request, response, form.updated_at)) return true;
      const body = await json(request);
      if (body.fields) {
        const errors = formErrors({ ...form, ...body });
        if (errors.length) {
          problem(response, 422, "validation_failed", "The request has invalid fields.", errors);
          return true;
        }
        if (JSON.stringify(body.fields) !== JSON.stringify(form.fields)) form.version += 1;
      }
      Object.assign(form, body, { updated_at: now() });
      tagged(response, 200, { data: form } satisfies Schemas["Data_FormResponse"], form.updated_at);
    } else if (method === "DELETE") {
      if (stale(request, response, form.updated_at)) return true;
      forms = forms.filter((f) => f !== form);
      submissions = submissions.filter((s) => s.form_id !== form.id);
      empty(response, 204);
    }
    return true;
  }

  // ------------------------------------------------------------ newsletter
  if (route === "GET /api/v1/newsletter/lists") {
    send(response, 200, page(lists, url) satisfies Schemas["Page_ListResponse"]);
    return true;
  }
  if (route === "POST /api/v1/newsletter/lists") {
    const body = await json(request);
    if (lists.some((l) => l.key === text(body, "key"))) {
      problem(
        response,
        409,
        "newsletter.list_key_taken",
        "This key is already used by another list.",
      );
      return true;
    }
    const t = now();
    const list: List = {
      id: randomUUID(),
      key: text(body, "key"),
      name: body.name as Schemas["NewsletterText"],
      description: (body.description as Schemas["NewsletterText"]) ?? {},
      double_opt_in: body.double_opt_in !== false,
      public: body.public === true,
      new_posts: (body.new_posts as Schemas["NewPosts"]) ?? "off",
      new_post_locale: "vi",
      subscriptions: { confirmed: 0, unconfirmed: 0, unsubscribed: 0 },
      created_at: t,
      updated_at: t,
    };
    lists.push(list);
    send(response, 201, { data: list } satisfies Schemas["Data_ListResponse"]);
    return true;
  }
  if (seg[0] === "newsletter" && seg[1] === "lists" && seg[2]) {
    const list = lists.find((l) => l.id === seg[2]);
    if (!list) {
      notFound(response, "newsletter.list_not_found");
      return true;
    }
    if (method === "GET") tagged(response, 200, { data: list }, list.updated_at);
    else if (method === "PATCH") {
      if (stale(request, response, list.updated_at)) return true;
      Object.assign(list, await json(request), { updated_at: now() });
      tagged(response, 200, { data: list }, list.updated_at);
    } else if (method === "DELETE") {
      if (stale(request, response, list.updated_at)) return true;
      lists = lists.filter((l) => l !== list);
      empty(response, 204);
    }
    return true;
  }
  if (route === "GET /api/v1/newsletter/campaigns") {
    const status = url.searchParams.get("status");
    const found = campaigns.filter((c) => !status || c.status === status);
    send(response, 200, page(found, url) satisfies Schemas["Page_CampaignResponse"]);
    return true;
  }
  if (route === "POST /api/v1/newsletter/campaigns") {
    const body = await json(request);
    const t = now();
    const campaign: Campaign = {
      id: randomUUID(),
      list_id: text(body, "list_id"),
      subject: text(body, "subject"),
      preheader: (body.preheader as string | null) ?? null,
      body_text: text(body, "body_text"),
      body_html: (body.body_html as string | null) ?? null,
      advertising: body.advertising === true,
      locale: body.locale === "en" ? "en" : "vi",
      status: "draft",
      progress: { total: 0, sent: 0, failed: 0, skipped: 0, pending: 0 },
      created_at: t,
      updated_at: t,
    };
    campaigns.unshift(campaign);
    send(response, 201, { data: campaign } satisfies Schemas["Data_CampaignResponse"]);
    return true;
  }
  if (seg[0] === "newsletter" && seg[1] === "campaigns" && seg[2]) {
    const c = campaigns.find((x) => x.id === seg[2]);
    if (!c) {
      notFound(response, "newsletter.campaign_not_found");
      return true;
    }
    const verb = seg[3];
    const done = () => {
      c.updated_at = now();
      tagged(response, 200, { data: c } satisfies Schemas["Data_CampaignResponse"], c.updated_at);
    };
    if (!verb) {
      if (method === "GET") tagged(response, 200, { data: c }, c.updated_at);
      else if (method === "PATCH") {
        if (stale(request, response, c.updated_at)) return true;
        Object.assign(c, await json(request), { status: "draft", scheduled_at: null });
        done();
      } else if (method === "DELETE") {
        if (stale(request, response, c.updated_at)) return true;
        campaigns = campaigns.filter((x) => x !== c);
        empty(response, 204);
      }
      return true;
    }
    if (verb === "test") {
      if (c.subject.includes("no-config")) {
        problem(
          response,
          503,
          "newsletter.preferences_url_missing",
          "Set AUTOXIDE_NEWSLETTER_PREFERENCES_URL before sending.",
        );
      } else empty(response, 202);
      return true;
    }
    if (
      stale(
        request,
        response,
        c.updated_at,
        verb !== "pause" && verb !== "resume" && verb !== "cancel",
      )
    ) {
      return true;
    }
    const recipients = lists.find((l) => l.id === c.list_id)?.subscriptions.confirmed ?? 0;
    if (verb === "schedule") {
      const body = await json(request);
      c.status = "scheduled";
      c.scheduled_at = text(body, "at");
    } else if (verb === "send") {
      c.status = "sending";
      c.started_at = now();
      c.progress = { total: recipients, sent: 0, failed: 0, skipped: 0, pending: recipients };
    } else if (verb === "pause") c.status = "paused";
    else if (verb === "resume") c.status = "sending";
    else if (verb === "cancel") {
      c.status = "cancelled";
      c.progress = { ...c.progress, skipped: c.progress.skipped + c.progress.pending, pending: 0 };
    }
    done();
    return true;
  }
  if (route === "GET /api/v1/newsletter/subscribers") {
    const email = (url.searchParams.get("email") ?? "").toLowerCase();
    const status = url.searchParams.get("status");
    const found = subscribers
      .filter((s) => !email || s.email.includes(email))
      .filter((s) => !status || s.subscriptions.some((x) => x.status === status));
    send(response, 200, page(found, url) satisfies Schemas["Page_SubscriberResponse"]);
    return true;
  }
  if (route === "POST /api/v1/newsletter/subscribers/import") {
    const body = await json(request);
    const people = (body.subscribers as { email: string; name?: string }[]) ?? [];
    let created = 0;
    for (const p of people) {
      if (subscribers.some((s) => s.email === p.email)) continue;
      created += 1;
      const t = now();
      subscribers.push({
        id: randomUUID(),
        email: p.email,
        name: p.name ?? null,
        locale: "vi",
        status: "active",
        attributes: {},
        soft_bounces: 0,
        suppressed: null,
        subscriptions: ((body.list_ids as string[]) ?? []).map((id) => ({
          list_id: id,
          list_key: lists.find((l) => l.id === id)?.key ?? null,
          status: "confirmed" as const,
          requested_at: t,
          confirmed_at: t,
          consent: { source: text(body, "consent_source"), at: t } as never,
        })),
        created_at: t,
        updated_at: t,
      });
    }
    send(response, 200, {
      data: {
        created,
        subscribed: created,
        unchanged: people.length - created,
        kept_unsubscribed: 0,
      },
    } satisfies Schemas["Data_ImportReport"]);
    return true;
  }
  if (seg[0] === "newsletter" && seg[1] === "subscribers" && seg[2]) {
    const s = subscribers.find((x) => x.id === seg[2]);
    if (!s) {
      notFound(response, "newsletter.subscriber_not_found");
      return true;
    }
    if (method === "GET") tagged(response, 200, { data: s }, s.updated_at);
    else if (method === "PATCH") {
      if (stale(request, response, s.updated_at)) return true;
      const body = await json(request);
      if (body.status) s.status = body.status as Schemas["SubscriberStatus"];
      if ("blocked_reason" in body)
        s.blocked_reason = (body.blocked_reason as string | null) ?? null;
      for (const id of (body.unsubscribe_list_ids as string[]) ?? []) {
        const sub = s.subscriptions.find((x) => x.list_id === id);
        if (sub) sub.status = "unsubscribed";
      }
      s.updated_at = now();
      tagged(response, 200, { data: s } satisfies Schemas["Data_SubscriberResponse"], s.updated_at);
    } else if (method === "DELETE") {
      subscribers = subscribers.filter((x) => x !== s);
      empty(response, 204);
    }
    return true;
  }
  if (route === "GET /api/v1/newsletter/suppressions") {
    send(response, 200, page(suppressions, url) satisfies Schemas["Page_SuppressionResponse"]);
    return true;
  }
  if (route === "POST /api/v1/newsletter/suppressions") {
    const body = await json(request);
    const entry: Suppression = {
      id: randomUUID(),
      email: text(body, "email").toLowerCase(),
      reason: "manual",
      note: (body.note as string | undefined) ?? null,
      created_at: now(),
    };
    suppressions.unshift(entry);
    send(response, 201, { data: entry } satisfies Schemas["Data_SuppressionResponse"]);
    return true;
  }
  if (seg[0] === "newsletter" && seg[1] === "suppressions" && seg[2] && method === "DELETE") {
    suppressions = suppressions.filter((s) => s.id !== seg[2]);
    empty(response, 204);
    return true;
  }
  if (route === "GET /api/v1/newsletter/data" || route === "DELETE /api/v1/newsletter/data") {
    const email = (url.searchParams.get("email") ?? "").toLowerCase();
    const s = subscribers.find((x) => x.email === email) ?? null;
    if (method === "DELETE") {
      subscribers = subscribers.filter((x) => x !== s);
      send(response, 200, {
        data: { deleted: Boolean(s) },
      } satisfies Schemas["Data_NewsletterErased"]);
    } else {
      send(response, 200, {
        data: { email, subscriber: s, deliveries: [], suppression: null },
      } satisfies Schemas["Data_NewsletterEmailData"]);
    }
    return true;
  }

  // ------------------------------------------------------------ comments
  if (route === "GET /api/v1/comments/public/settings") {
    send(response, 200, {
      data: {
        enabled: true,
        guests_allowed: true,
        signed_in_only_types: [],
        verified_only_types: [],
        markdown: false,
        target_types: ["content.entry", "demo.page"],
        max_length: 5000,
        max_links: 2,
        edit_minutes: 15,
        reply_mails: true,
        token_scope: "comments",
      },
    } satisfies Schemas["Data_CommentSettings"]);
    return true;
  }
  if (route === "GET /api/v1/comments/profile" || route === "PUT /api/v1/comments/profile") {
    if (method === "PUT") profile = text(await json(request), "display_name");
    send(response, 200, {
      data: { display_name: profile },
    } satisfies Schemas["Data_CommentProfile"]);
    return true;
  }
  if (route === "GET /api/v1/comments") {
    const status = url.searchParams.get("status") ?? "pending";
    const q = (url.searchParams.get("q") ?? "").toLowerCase();
    const found = comments
      .filter((c) => c.status === status)
      .filter((c) => !q || c.body.toLowerCase().includes(q))
      .reverse();
    send(response, 200, page(found, url) satisfies Schemas["Page_CommentDetail"]);
    return true;
  }
  if (route === "GET /api/v1/comments/bans") {
    const active = url.searchParams.get("active") === "true";
    send(
      response,
      200,
      page(
        bans.filter((b) => !active || b.active),
        url,
      ) satisfies Schemas["Page_CommentBan"],
    );
    return true;
  }
  if (route === "POST /api/v1/comments/bans") {
    const body = await json(request);
    if (!text(body, "reason")) {
      problem(response, 422, "validation_failed", "The request has invalid fields.", [
        { field: "reason", code: "length", detail: "1 to 500 characters" },
      ]);
      return true;
    }
    const ban: Ban = {
      id: randomUUID(),
      kind: text(body, "kind"),
      value: text(body, "value"),
      reason: text(body, "reason"),
      until: (body.until as string | undefined) ?? null,
      active: true,
      created_at: now(),
      created_by: null,
    };
    bans.unshift(ban);
    send(response, 201, { data: ban } satisfies Schemas["Data_CommentBan"]);
    return true;
  }
  if (seg[0] === "comments" && seg[1] === "bans" && seg[2] && method === "DELETE") {
    bans = bans.filter((b) => b.id !== seg[2]);
    empty(response, 204);
    return true;
  }
  if (seg[0] === "comments" && seg[1] === "targets" && seg[2] && seg[3]) {
    const type = decodeURIComponent(seg[2]);
    const id = decodeURIComponent(seg[3]);
    let target = targets.find((t) => t.target_type === type && t.target_id === id);
    if (!target) {
      const mine = comments.filter((c) => c.target_type === type && c.target_id === id);
      target = {
        target_type: type,
        target_id: id,
        state: "open",
        hidden: false,
        closes_at: null,
        comment_count: mine.filter((c) => c.status === "published").length,
        pending_count: mine.filter((c) => c.status === "pending").length,
        thread_count: mine.filter((c) => c.status === "published" && c.root_id === c.id).length,
      };
      targets.push(target);
    }
    if (method === "PUT") {
      const body = await json(request);
      if (typeof body.state === "string")
        target.state = body.state as Schemas["CommentTargetState"];
      if (typeof body.hidden === "boolean") {
        target.hidden = body.hidden;
        if (body.hidden) target.state = "closed";
      }
      if ("closes_at" in body) target.closes_at = (body.closes_at as string | null) ?? null;
    }
    send(response, 200, { data: target } satisfies Schemas["Data_CommentTarget"]);
    return true;
  }
  if (route === "GET /api/v1/comments/data" || route === "DELETE /api/v1/comments/data") {
    const email = (url.searchParams.get("email") ?? "").toLowerCase();
    const mine = comments.filter((c) => c.author_email === email);
    if (method === "DELETE") {
      for (const c of mine) Object.assign(c, { body: "", author_name: null, author_email: null });
      send(response, 200, {
        data: { cleared: mine.length },
      } satisfies Schemas["Data_CommentsErasedResponse"]);
    } else {
      send(response, 200, {
        data: { email, comments: mine, follows: [], bans: [] },
      } satisfies Schemas["Data_CommentsEmailData"]);
    }
    return true;
  }
  if (seg[0] === "comments" && seg[1]) {
    const c = comments.find((x) => x.id === seg[1]);
    if (!c) {
      notFound(response, "comments.not_found");
      return true;
    }
    if (seg[2] === "reports") {
      send(response, 200, {
        data: [],
        pagination: { limit: 50, next_cursor: null },
      } satisfies Schemas["Page_CommentReport"]);
    } else if (method === "GET") tagged(response, 200, { data: c }, c.updated_at);
    else if (method === "PATCH") {
      if (stale(request, response, c.updated_at)) return true;
      c.status = (await json(request)).status as Schemas["CommentStatus"];
      c.published_at = c.status === "published" ? now() : (c.published_at ?? null);
      c.updated_at = now();
      tagged(response, 200, { data: c } satisfies Schemas["Data_CommentDetail"], c.updated_at);
    } else if (method === "DELETE") {
      comments = comments.filter((x) => x !== c);
      send(response, 200, { data: { deleted: 1 } } satisfies Schemas["Data_CommentsPurged"]);
    }
    return true;
  }
  problem(response, 404, "not_found", "No such endpoint (mock).");
  return true;
}

function csvOf(form: Form): string {
  const rows = submissions.filter((s) => s.form_id === form.id);
  const cell = (v: string) => `"${/^[=+\-@]/.test(v) ? `'${v}` : v}"`;
  const csv = [
    ["id", "created_at", "status", "email", ...form.fields.map((f) => f.key)].map(cell).join(","),
    ...rows.map((s) =>
      [s.id, s.created_at, s.status, s.email ?? "", ...s.answers.map((a) => String(a.value))]
        .map(cell)
        .join(","),
    ),
  ].join("\r\n");
  return `\uFEFF${csv}\r\n`;
}
