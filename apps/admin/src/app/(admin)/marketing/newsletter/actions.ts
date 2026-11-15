"use server";

// Server Action của màn Bản tin, gọi module `newsletter` của core bằng token trong cookie
// `httpOnly`. Core kiểm quyền và dữ liệu, báo mọi lỗi một lần; ở đây chỉ kiểm ô bắt buộc để báo
// sớm. Lệnh sửa và lệnh gửi gửi `If-Match` (qua `versioned`), để đúng bản người dùng đã đọc được
// gửi đi và không ai sửa chiến dịch đã duyệt sau lưng họ.
import type { components } from "@autoxide/sdk";
import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { send } from "@/lib/action";
import type { DataState } from "@/lib/engage";
import { type ChangeState, field, versioned } from "@/lib/engage-server";
import { type FormState, nextDone, problemState } from "@/lib/form";
import { IMPORT_MAX, NEW_POSTS, parseSubscriberCsv } from "@/lib/newsletter";

type Schemas = components["schemas"];

const NEWSLETTER = "/marketing/newsletter";

function locale(formData: FormData): "en" | "vi" {
  return field(formData, "locale") === "en" ? "en" : "vi";
}

function text(formData: FormData, vi: string, en: string): Schemas["NewsletterText"] {
  const v = field(formData, vi);
  const e = field(formData, en);
  return { ...(v ? { vi: v } : {}), ...(e ? { en: e } : {}) };
}

// ---------------------------------------------------------------- Chiến dịch

const CAMPAIGN_FIELDS = [
  "list_id",
  "subject",
  "preheader",
  "body_text",
  "body_html",
  "advertising",
  "locale",
];

async function readCampaign(
  formData: FormData,
): Promise<{ ok: true; body: Schemas["CreateCampaignRequest"] } | { ok: false; state: FormState }> {
  const t = await getTranslations("engage.newsletter.required");
  const body: Schemas["CreateCampaignRequest"] = {
    list_id: field(formData, "list_id"),
    subject: field(formData, "subject"),
    body_text: String(formData.get("body_text") ?? ""),
    advertising: formData.get("advertising") === "on",
    locale: locale(formData),
  };
  const preheader = field(formData, "preheader");
  const html = String(formData.get("body_html") ?? "");
  body.preheader = preheader || null;
  body.body_html = html.trim() ? html : null;
  const errors: Record<string, string> = {};
  if (!body.list_id) errors.list_id = t("list");
  if (!body.subject) errors.subject = t("subject");
  if (!body.body_text.trim()) errors.body_text = t("body");
  const values = {
    subject: body.subject,
    preheader,
    body_text: body.body_text,
    body_html: html,
  };
  if (Object.keys(errors).length > 0) return { ok: false, state: { fields: errors, values } };
  return { ok: true, body };
}

/** Tạo chiến dịch nháp; xong thì mở trang của nó. Chưa gửi gì. */
export async function createCampaign(_state: FormState, formData: FormData): Promise<FormState> {
  const input = await readCampaign(formData);
  if (!input.ok) return input.state;
  const result = await send((client) =>
    client.POST("/api/v1/newsletter/campaigns", { body: input.body }),
  );
  if (!result.ok) return problemState(result.problem, CAMPAIGN_FIELDS);
  redirect(`${NEWSLETTER}/campaigns/${result.data.data.id}?created=1`);
}

/**
 * Sửa chiến dịch nháp hay đã hẹn giờ. Core đưa chiến dịch đã hẹn giờ về nháp khi có thay đổi
 * (phải hẹn lại), để không ai sửa bản đã duyệt sau lưng người gửi.
 */
export async function updateCampaign(state: FormState, formData: FormData): Promise<FormState> {
  const input = await readCampaign(formData);
  if (!input.ok) return input.state;
  const id = field(formData, "id");
  const result = await versioned(
    (client) => client.GET("/api/v1/newsletter/campaigns/{id}", { params: { path: { id } } }),
    field(formData, "expect"),
    (client, etag) =>
      client.PATCH("/api/v1/newsletter/campaigns/{id}", {
        params: { path: { id }, header: { "If-Match": etag } },
        body: input.body,
      }),
  );
  if (!result.ok) return problemState(result.problem, CAMPAIGN_FIELDS);
  refresh();
  return { done: nextDone(state) };
}

type Step = "send" | "pause" | "resume" | "cancel";

async function step(state: ChangeState, formData: FormData, which: Step): Promise<ChangeState> {
  const id = field(formData, "id");
  const result = await versioned(
    (client) => client.GET("/api/v1/newsletter/campaigns/{id}", { params: { path: { id } } }),
    field(formData, "expect"),
    (client, etag) => {
      const params = { params: { path: { id }, header: { "If-Match": etag } } };
      switch (which) {
        case "send":
          return client.POST("/api/v1/newsletter/campaigns/{id}/send", params);
        case "pause":
          return client.POST("/api/v1/newsletter/campaigns/{id}/pause", params);
        case "resume":
          return client.POST("/api/v1/newsletter/campaigns/{id}/resume", params);
        case "cancel":
          return client.POST("/api/v1/newsletter/campaigns/{id}/cancel", params);
      }
    },
  );
  if (!result.ok) return problemState(result.problem, []);
  refresh();
  return {
    done: nextDone(state),
    updated: result.data.data.updated_at,
    previous: result.before.status,
  };
}

/** Gửi ngay: core lấy mọi người đã xác nhận của danh sách lúc này rồi gửi theo lô. */
export async function sendCampaign(state: ChangeState, formData: FormData): Promise<ChangeState> {
  return step(state, formData, "send");
}

/** Huỷ hẳn: thư chưa gửi tính là bỏ qua. Không đảo được. */
export async function cancelCampaign(state: ChangeState, formData: FormData): Promise<ChangeState> {
  return step(state, formData, "cancel");
}

/**
 * Tạm dừng hay tiếp tục, theo `status` của nút (`paused` / `sending`). Đảo được: Hoàn tác gửi
 * lệnh ngược lại.
 */
export async function pauseOrResume(state: ChangeState, formData: FormData): Promise<ChangeState> {
  const wanted = field(formData, "status");
  return step(state, formData, wanted === "paused" ? "pause" : "resume");
}

/** Hẹn giờ gửi. `at` là ISO 8601 có múi giờ (trình duyệt đổi từ giờ địa phương của người xem). */
export async function scheduleCampaign(state: FormState, formData: FormData): Promise<FormState> {
  const at = field(formData, "at");
  if (!at) {
    const t = await getTranslations("engage.newsletter.required");
    return { fields: { at: t("at") } };
  }
  const id = field(formData, "id");
  const result = await versioned(
    (client) => client.GET("/api/v1/newsletter/campaigns/{id}", { params: { path: { id } } }),
    field(formData, "expect"),
    (client, etag) =>
      client.POST("/api/v1/newsletter/campaigns/{id}/schedule", {
        params: { path: { id }, header: { "If-Match": etag } },
        body: { at },
      }),
  );
  if (!result.ok) return problemState(result.problem, ["at"]);
  refresh();
  return { done: nextDone(state) };
}

/** Gửi thử tới một địa chỉ: như người đăng ký sẽ nhận, không tính vào số liệu. */
export async function testCampaign(state: FormState, formData: FormData): Promise<FormState> {
  const email = field(formData, "email");
  if (!email) {
    const t = await getTranslations("engage.newsletter.required");
    return { fields: { email: t("email") } };
  }
  const id = field(formData, "id");
  const result = await send((client) =>
    client.POST("/api/v1/newsletter/campaigns/{id}/test", {
      params: { path: { id } },
      body: { email },
    }),
  );
  if (!result.ok) return { ...problemState(result.problem, ["email"]), values: { email } };
  return { done: nextDone(state) };
}

/** Xoá chiến dịch chưa gửi thư nào; về danh sách. */
export async function deleteCampaign(_state: FormState, formData: FormData): Promise<FormState> {
  const id = field(formData, "id");
  const result = await versioned(
    (client) => client.GET("/api/v1/newsletter/campaigns/{id}", { params: { path: { id } } }),
    field(formData, "expect"),
    (client, etag) =>
      client.DELETE("/api/v1/newsletter/campaigns/{id}", {
        params: { path: { id }, header: { "If-Match": etag } },
      }),
  );
  if (!result.ok) return problemState(result.problem, []);
  redirect(`${NEWSLETTER}?deleted=1`);
}

// ---------------------------------------------------------------- Danh sách nhận tin

const LIST_FIELDS = ["key", "name", "description", "double_opt_in", "public", "new_posts"];

async function readList(
  formData: FormData,
): Promise<{ ok: true; body: Schemas["CreateListRequest"] } | { ok: false; state: FormState }> {
  const t = await getTranslations("engage.newsletter.required");
  const name = text(formData, "name_vi", "name_en");
  const key = field(formData, "key");
  const errors: Record<string, string> = {};
  if (!name.vi && !name.en) errors.name = t("listName");
  if (!key) errors.key = t("key");
  if (Object.keys(errors).length > 0) {
    return {
      ok: false,
      state: {
        fields: errors,
        values: {
          key,
          name_vi: name.vi ?? "",
          name_en: name.en ?? "",
          description_vi: field(formData, "description_vi"),
          description_en: field(formData, "description_en"),
        },
      },
    };
  }
  const newPosts = NEW_POSTS.find((n) => n === field(formData, "new_posts")) ?? "off";
  return {
    ok: true,
    body: {
      key,
      name,
      description: text(formData, "description_vi", "description_en"),
      double_opt_in: formData.get("double_opt_in") === "on",
      public: formData.get("public") === "on",
      new_posts: newPosts,
      new_post_locale: field(formData, "new_post_locale") === "en" ? "en" : "vi",
    },
  };
}

/** Lỗi của `name.vi` / `description.en` gắn vào ô của cả trường. */
function byRoot(problem: components["schemas"]["Problem"]) {
  if (!problem.errors) return problem;
  return {
    ...problem,
    errors: problem.errors.map((entry) => ({ ...entry, field: entry.field.split(".")[0] ?? "" })),
  };
}

/** Tạo danh sách nhận tin. */
export async function createList(state: FormState, formData: FormData): Promise<FormState> {
  const input = await readList(formData);
  if (!input.ok) return input.state;
  const result = await send((client) =>
    client.POST("/api/v1/newsletter/lists", { body: input.body }),
  );
  if (!result.ok)
    return problemState(byRoot(result.problem), LIST_FIELDS, {
      "newsletter.list_key_taken": "key",
    });
  refresh();
  return { done: nextDone(state) };
}

/** Sửa danh sách (`If-Match`). */
export async function updateList(state: FormState, formData: FormData): Promise<FormState> {
  const input = await readList(formData);
  if (!input.ok) return input.state;
  const id = field(formData, "id");
  const result = await versioned(
    (client) => client.GET("/api/v1/newsletter/lists/{id}", { params: { path: { id } } }),
    field(formData, "expect"),
    (client, etag) =>
      client.PATCH("/api/v1/newsletter/lists/{id}", {
        params: { path: { id }, header: { "If-Match": etag } },
        body: input.body,
      }),
  );
  if (!result.ok)
    return problemState(byRoot(result.problem), LIST_FIELDS, {
      "newsletter.list_key_taken": "key",
    });
  refresh();
  return { done: nextDone(state) };
}

/** Xoá danh sách và mọi đăng ký vào nó; về tab danh sách. */
export async function deleteList(_state: FormState, formData: FormData): Promise<FormState> {
  const id = field(formData, "id");
  const result = await versioned(
    (client) => client.GET("/api/v1/newsletter/lists/{id}", { params: { path: { id } } }),
    field(formData, "expect"),
    (client, etag) =>
      client.DELETE("/api/v1/newsletter/lists/{id}", {
        params: { path: { id }, header: { "If-Match": etag } },
      }),
  );
  if (!result.ok) return problemState(result.problem, []);
  redirect(`${NEWSLETTER}/lists?deleted=1`);
}

// ---------------------------------------------------------------- Người đăng ký

export interface ImportState extends FormState {
  report?: Schemas["ImportReport"];
  /** Dòng của tệp bị bỏ trước khi gửi (email sai, trùng). */
  skipped?: { line: number; reason: "email" | "duplicate" }[];
}

/**
 * Nhập người đăng ký từ CSV (tệp hoặc chữ dán vào). Chỉ nhập người đã đồng ý nhận tin: nguồn
 * đồng ý là bắt buộc và được core lưu làm bằng chứng. Người đã huỷ đăng ký vẫn giữ trạng thái huỷ.
 */
export async function importSubscribers(
  state: ImportState,
  formData: FormData,
): Promise<ImportState> {
  const t = await getTranslations("engage.newsletter.required");
  const file = formData.get("file");
  const pasted = String(formData.get("csv") ?? "");
  const raw = file instanceof File && file.size > 0 ? await file.text() : pasted;
  const listIds = formData.getAll("list_id").map(String).filter(Boolean);
  const source = field(formData, "consent_source");
  const parsed = parseSubscriberCsv(raw);
  const errors: Record<string, string> = {};
  if (listIds.length === 0) errors.list_ids = t("lists");
  if (!source) errors.consent_source = t("source");
  if (parsed.people.length === 0) errors.csv = t("csv");
  if (parsed.tooMany) errors.csv = t("tooMany", { max: IMPORT_MAX });
  const values = {
    csv: pasted,
    consent_source: source,
    consent_text: field(formData, "consent_text"),
  };
  if (Object.keys(errors).length > 0) return { fields: errors, values, skipped: parsed.skipped };
  const consentText = field(formData, "consent_text");
  const result = await send((client) =>
    client.POST("/api/v1/newsletter/subscribers/import", {
      body: {
        list_ids: listIds,
        subscribers: parsed.people,
        consent_source: source,
        ...(consentText ? { consent_text: consentText } : {}),
      },
    }),
  );
  if (!result.ok) {
    return {
      ...problemState(
        {
          ...result.problem,
          ...(result.problem.errors
            ? {
                errors: result.problem.errors.map((entry) => ({
                  ...entry,
                  field: entry.field.startsWith("subscribers") ? "csv" : entry.field,
                })),
              }
            : {}),
        },
        ["list_ids", "consent_source", "consent_text", "csv"],
      ),
      values,
      skipped: parsed.skipped,
    };
  }
  refresh();
  return { done: nextDone(state), report: result.data.data, skipped: parsed.skipped };
}

/**
 * Chặn / bỏ chặn một người đăng ký (`status` = `blocked` / `active`). Đảo được. Người bị chặn
 * không nhận chiến dịch nào, dù còn đăng ký.
 */
export async function setSubscriberStatus(
  state: ChangeState,
  formData: FormData,
): Promise<ChangeState> {
  const id = field(formData, "id");
  const blocked = field(formData, "status") === "blocked";
  const reason = field(formData, "reason");
  const result = await versioned(
    (client) => client.GET("/api/v1/newsletter/subscribers/{id}", { params: { path: { id } } }),
    field(formData, "expect"),
    (client, etag) =>
      client.PATCH("/api/v1/newsletter/subscribers/{id}", {
        params: { path: { id }, header: { "If-Match": etag } },
        body: blocked
          ? { status: "blocked", ...(reason ? { blocked_reason: reason } : {}) }
          : { status: "active", blocked_reason: null },
      }),
  );
  if (!result.ok) return problemState(result.problem, ["reason"]);
  refresh();
  return {
    done: nextDone(state),
    updated: result.data.data.updated_at,
    previous: result.before.status,
  };
}

/** Huỷ đăng ký người này khỏi các danh sách đã chọn (quản trị viên không đăng ký thay ai được). */
export async function unsubscribeLists(state: FormState, formData: FormData): Promise<FormState> {
  const id = field(formData, "id");
  const lists = formData.getAll("list_id").map(String).filter(Boolean);
  if (lists.length === 0) {
    const t = await getTranslations("engage.newsletter.required");
    return { fields: { list_id: t("lists") } };
  }
  const result = await versioned(
    (client) => client.GET("/api/v1/newsletter/subscribers/{id}", { params: { path: { id } } }),
    field(formData, "expect"),
    (client, etag) =>
      client.PATCH("/api/v1/newsletter/subscribers/{id}", {
        params: { path: { id }, header: { "If-Match": etag } },
        body: { unsubscribe_list_ids: lists },
      }),
  );
  if (!result.ok) return problemState(result.problem, ["list_id"]);
  refresh();
  return { done: nextDone(state) };
}

/** Xoá hẳn người đăng ký (giữ địa chỉ trong danh sách không gửi nếu có); về tab người đăng ký. */
export async function deleteSubscriber(_state: FormState, formData: FormData): Promise<FormState> {
  const id = field(formData, "id");
  const result = await send((client) =>
    client.DELETE("/api/v1/newsletter/subscribers/{id}", { params: { path: { id } } }),
  );
  if (!result.ok) return problemState(result.problem, []);
  redirect(`${NEWSLETTER}/subscribers?deleted=1`);
}

// ---------------------------------------------------------------- Danh sách không gửi

/** Thêm một địa chỉ vào danh sách không gửi. */
export async function addSuppression(state: FormState, formData: FormData): Promise<FormState> {
  const email = field(formData, "email");
  const note = field(formData, "note");
  if (!email) {
    const t = await getTranslations("engage.newsletter.required");
    return { fields: { email: t("email") }, values: { note } };
  }
  const result = await send((client) =>
    client.POST("/api/v1/newsletter/suppressions", {
      body: { email, ...(note ? { note } : {}) },
    }),
  );
  if (!result.ok)
    return { ...problemState(result.problem, ["email", "note"]), values: { email, note } };
  refresh();
  return { done: nextDone(state) };
}

/** Gỡ địa chỉ khỏi danh sách không gửi: nhận lại chiến dịch nếu còn đăng ký. */
export async function removeSuppression(state: FormState, formData: FormData): Promise<FormState> {
  const id = field(formData, "id");
  const result = await send((client) =>
    client.DELETE("/api/v1/newsletter/suppressions/{id}", { params: { path: { id } } }),
  );
  if (!result.ok) return problemState(result.problem, []);
  refresh();
  return { done: nextDone(state) };
}

// ---------------------------------------------------------------- Dữ liệu theo email

/** Tra người đăng ký, đăng ký kèm bằng chứng đồng ý, thư đã gửi và chặn của một email. */
export async function lookupNewsletterData(
  state: DataState,
  formData: FormData,
): Promise<DataState> {
  const email = field(formData, "email");
  if (!email) {
    const t = await getTranslations("engage.data");
    return { fields: { email: t("emailRequired") } };
  }
  const result = await send((client) =>
    client.GET("/api/v1/newsletter/data", { params: { query: { email } } }),
  );
  if (!result.ok) return { ...problemState(result.problem, ["email"]), values: { email } };
  return { done: nextDone(state), email, found: result.data.data };
}

/** Xoá hẳn người đăng ký có email này (địa chỉ trong danh sách không gửi được giữ). */
export async function eraseNewsletterData(
  state: DataState,
  formData: FormData,
): Promise<DataState> {
  const email = field(formData, "email");
  const result = await send((client) =>
    client.DELETE("/api/v1/newsletter/data", { params: { query: { email } } }),
  );
  if (!result.ok) return problemState(result.problem, []);
  refresh();
  return { done: nextDone(state), email };
}
