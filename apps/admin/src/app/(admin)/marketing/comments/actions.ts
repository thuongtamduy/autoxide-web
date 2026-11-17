"use server";

// Server Action của màn Bình luận, gọi module `comments` của core bằng token trong cookie
// `httpOnly`. Mọi quyết định kiểm duyệt được core ghi vào audit log. Đổi trạng thái gửi `If-Match`
// (core bắt buộc) qua `versioned`: bình luận đã đổi kể từ lúc mở trang thì báo, không ghi đè.
import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { send } from "@/lib/action";
import { BAN_KINDS } from "@/lib/comments";
import type { DataState } from "@/lib/engage";
import { type ChangeState, field, versioned } from "@/lib/engage-server";
import { type FormState, nextDone, problemState } from "@/lib/form";
import { type BulkInput, type BulkResult, cleanIds, eachId } from "@/lib/table";

const COMMENTS = "/marketing/comments";
const MOVES = ["published", "rejected", "spam", "pending"] as const;

/** Duyệt, từ chối, đánh spam hay giữ lại một bình luận. Đảo được (Hoàn tác). */
export async function moderateComment(
  state: ChangeState,
  formData: FormData,
): Promise<ChangeState> {
  const id = field(formData, "id");
  const status = MOVES.find((s) => s === field(formData, "status"));
  if (!status) return { error: (await getTranslations("engage"))("badRequest") };
  const result = await versioned(
    (client) => client.GET("/api/v1/comments/{id}", { params: { path: { id } } }),
    field(formData, "expect"),
    (client, etag) =>
      client.PATCH("/api/v1/comments/{id}", {
        params: { path: { id }, header: { "If-Match": etag } },
        body: { status },
      }),
  );
  if (!result.ok) return problemState(result.problem, []);
  refresh();
  return {
    done: nextDone(state),
    updated: result.data.data.updated_at,
    previous: result.before.status,
  };
}

/**
 * Kiểm duyệt nhiều bình luận (thanh hàng loạt). Core chỉ có `PATCH /comments/{id}`: lặp từng id, mỗi
 * lần đọc ETag rồi ghi kèm `If-Match` (không bịa endpoint hàng loạt); lỗi từng dòng là `detail` của core.
 */
async function bulkModerate(input: BulkInput, status: (typeof MOVES)[number]): Promise<BulkResult> {
  const result = await eachId(cleanIds(input.ids), async (id) => {
    const written = await versioned(
      (client) => client.GET("/api/v1/comments/{id}", { params: { path: { id } } }),
      undefined,
      (client, etag) =>
        client.PATCH("/api/v1/comments/{id}", {
          params: { path: { id }, header: { "If-Match": etag } },
          body: { status },
        }),
    );
    return written.ok ? null : written.problem.detail;
  });
  refresh();
  return result;
}

export async function bulkApproveComments(input: BulkInput): Promise<BulkResult> {
  return bulkModerate(input, "published");
}

export async function bulkRejectComments(input: BulkInput): Promise<BulkResult> {
  return bulkModerate(input, "rejected");
}

export async function bulkSpamComments(input: BulkInput): Promise<BulkResult> {
  return bulkModerate(input, "spam");
}

/** Xoá hẳn nhiều bình luận (gốc thì cả luồng); lặp `DELETE /comments/{id}`. Không đảo được. */
export async function bulkPurgeComments(input: BulkInput): Promise<BulkResult> {
  const result = await eachId(cleanIds(input.ids), async (id) => {
    const deleted = await send((client) =>
      client.DELETE("/api/v1/comments/{id}", { params: { path: { id } } }),
    );
    return deleted.ok ? null : deleted.problem.detail;
  });
  refresh();
  return result;
}

/** Xoá hẳn (gỡ theo yêu cầu): bình luận gốc thì cả luồng. Không đảo được; core ghi audit. */
export async function purgeComment(_state: FormState, formData: FormData): Promise<FormState> {
  const id = field(formData, "id");
  const result = await send((client) =>
    client.DELETE("/api/v1/comments/{id}", { params: { path: { id } } }),
  );
  if (!result.ok) return problemState(result.problem, []);
  redirect(`${COMMENTS}?purged=${result.data.data.deleted}`);
}

/** Cấm bình luận theo tài khoản, email hay dấu vết mạng; lý do bắt buộc. */
export async function createBan(state: FormState, formData: FormData): Promise<FormState> {
  const t = await getTranslations("engage.comments.required");
  const kind = BAN_KINDS.find((k) => k === field(formData, "kind"));
  const value = field(formData, "value");
  const reason = field(formData, "reason");
  const until = field(formData, "until");
  const errors: Record<string, string> = {};
  if (!kind) errors.kind = t("kind");
  if (!value) errors.value = t("value");
  if (!reason) errors.reason = t("reason");
  const values = { kind: kind ?? "", value, reason, until };
  if (!kind || Object.keys(errors).length > 0) return { fields: errors, values };
  const result = await send((client) =>
    client.POST("/api/v1/comments/bans", {
      body: { kind, value, reason, ...(until ? { until } : {}) },
    }),
  );
  if (!result.ok) {
    return { ...problemState(result.problem, ["kind", "value", "reason", "until"]), values };
  }
  refresh();
  return { done: nextDone(state) };
}

/** Gỡ cấm. */
export async function liftBan(state: FormState, formData: FormData): Promise<FormState> {
  const id = field(formData, "id");
  const result = await send((client) =>
    client.DELETE("/api/v1/comments/bans/{id}", { params: { path: { id } } }),
  );
  if (!result.ok) return problemState(result.problem, []);
  refresh();
  return { done: nextDone(state) };
}

/**
 * Mở, đóng hay ẩn bình luận của một đích (`state` = `open` / `closed` / `hidden`). Đảo được:
 * trả trạng thái cũ cho Hoàn tác. Ẩn cũng đóng đích; mở lại thì bỏ ẩn.
 */
export async function setTargetState(state: ChangeState, formData: FormData): Promise<ChangeState> {
  const type = field(formData, "type");
  const id = field(formData, "target");
  const wanted = field(formData, "status");
  const body =
    wanted === "hidden"
      ? { hidden: true }
      : wanted === "closed"
        ? { state: "closed", hidden: false }
        : { state: "open", hidden: false };
  const before = await send((client) =>
    client.GET("/api/v1/comments/targets/{target_type}/{target_id}", {
      params: { path: { target_type: type, target_id: id } },
    }),
  );
  if (!before.ok) return problemState(before.problem, []);
  const previous = before.data.data.hidden ? "hidden" : before.data.data.state;
  const result = await send((client) =>
    client.PUT("/api/v1/comments/targets/{target_type}/{target_id}", {
      params: { path: { target_type: type, target_id: id } },
      body,
    }),
  );
  if (!result.ok) return problemState(result.problem, []);
  refresh();
  // Đích không có `updated_at`; Hoàn tác không cần kiểm phiên bản (`If-Match` là tuỳ chọn ở đây).
  return { done: nextDone(state), previous, updated: "-" };
}

/** Đặt hay bỏ giờ tự đóng của một đích. `at` là ISO 8601 (trình duyệt đổi từ giờ địa phương). */
export async function setTargetCloses(state: FormState, formData: FormData): Promise<FormState> {
  const type = field(formData, "type");
  const id = field(formData, "target");
  const at = field(formData, "at");
  const result = await send((client) =>
    client.PUT("/api/v1/comments/targets/{target_type}/{target_id}", {
      params: { path: { target_type: type, target_id: id } },
      body: { closes_at: at || null },
    }),
  );
  if (!result.ok) return problemState(result.problem, ["closes_at"]);
  refresh();
  return { done: nextDone(state) };
}

/** Tên hiển thị của chính người quản trị khi bình luận (core đòi trước khi bình luận). */
export async function saveProfile(state: FormState, formData: FormData): Promise<FormState> {
  const name = field(formData, "display_name");
  if (!name) {
    const t = await getTranslations("engage.comments.required");
    return { fields: { display_name: t("displayName") } };
  }
  const result = await send((client) =>
    client.PUT("/api/v1/comments/profile", { body: { display_name: name } }),
  );
  if (!result.ok) {
    return {
      ...problemState(result.problem, ["display_name"], { "comments.name_taken": "display_name" }),
      values: { display_name: name },
    };
  }
  refresh();
  return { done: nextDone(state) };
}

// ---------------------------------------------------------------- Dữ liệu theo email

/** Tra bình luận, theo dõi trả lời và lệnh cấm của một email. */
export async function lookupCommentsData(state: DataState, formData: FormData): Promise<DataState> {
  const email = field(formData, "email");
  if (!email) {
    const t = await getTranslations("engage.data");
    return { fields: { email: t("emailRequired") } };
  }
  const result = await send((client) =>
    client.GET("/api/v1/comments/data", { params: { query: { email } } }),
  );
  if (!result.ok) return { ...problemState(result.problem, ["email"]), values: { email } };
  return { done: nextDone(state), email, found: result.data.data };
}

/** Xoá chữ, tên, email, dấu vết mạng của mọi bình luận viết bằng email này (giữ chỗ trong luồng). */
export async function eraseCommentsData(state: DataState, formData: FormData): Promise<DataState> {
  const email = field(formData, "email");
  const result = await send((client) =>
    client.DELETE("/api/v1/comments/data", { params: { query: { email } } }),
  );
  if (!result.ok) return problemState(result.problem, []);
  refresh();
  return { done: nextDone(state), email };
}
