"use server";

// Server Action của các tab Lời mời, Uỷ quyền, Quyền vào hỗ trợ (bước 34 của core: D-310, D-312,
// D-313). Core kiểm quyền (`auth.invitations.manage`, `auth.delegations.manage`,
// `organizations.settings.write`, `auth.support_access.manage`), phạm vi nút và luật dữ liệu; ở đây
// chỉ kiểm ô bắt buộc để gom mọi lỗi một lần, rồi đổi Problem thành lỗi theo ô.
import { refresh } from "next/cache";
import { getTranslations } from "next-intl/server";
import { type Outcome, send } from "@/lib/action";
import { type FormState, nextDone, problemState } from "@/lib/form";
import { rootUnit } from "@/lib/org-server";
import { type BulkInput, type BulkResult, cleanIds, eachId } from "@/lib/table";

function text(formData: FormData, name: string): string {
  return String(formData.get(name) ?? "").trim();
}

function values(formData: FormData, names: readonly string[]): Record<string, string> {
  return Object.fromEntries(names.map((name) => [name, text(formData, name)]));
}

async function done(state: FormState): Promise<FormState> {
  refresh();
  return { done: nextDone(state) };
}

// ---------------------------------------------------------------- Lời mời

const INVITE_FIELDS = ["email", "name", "org_id", "role_ids"];

/** Mời một người vào một nút với các role ở đó (`POST /auth/invitations`). Core gửi thư. */
export async function inviteStaff(state: FormState, formData: FormData): Promise<FormState> {
  const typed = values(formData, ["email", "name", "org_id"]);
  const roleIds = formData.getAll("role").map(String).filter(Boolean);
  const t = await getTranslations("access.required");
  const fields: Record<string, string> = {};
  if (!typed.email) fields.email = t("email");
  if (roleIds.length === 0) fields.role_ids = t("roles");
  if (Object.keys(fields).length > 0) return { fields, values: typed };
  const result = await send((client) =>
    client.POST("/api/v1/auth/invitations", {
      body: {
        email: typed.email ?? "",
        role_ids: roleIds,
        ...(typed.name ? { name: typed.name } : {}),
        ...(typed.org_id ? { org_id: typed.org_id } : {}),
      },
    }),
  );
  if (!result.ok) return { ...problemState(result.problem, INVITE_FIELDS), values: typed };
  return done(state);
}

/** Gửi lại thư mời (hạn tính lại từ đầu, token cũ hết hiệu lực). */
export async function resendInvite(state: FormState, formData: FormData): Promise<FormState> {
  const result = await send((client) =>
    client.POST("/api/v1/auth/invitations/{id}/resend", {
      params: { path: { id: text(formData, "id") } },
    }),
  );
  if (!result.ok) return problemState(result.problem, []);
  return done(state);
}

/** Thu hồi lời mời: link trong thư không dùng được nữa. */
export async function revokeInvite(state: FormState, formData: FormData): Promise<FormState> {
  const result = await send((client) =>
    client.DELETE("/api/v1/auth/invitations/{id}", {
      params: { path: { id: text(formData, "id") } },
    }),
  );
  if (!result.ok) return problemState(result.problem, []);
  return done(state);
}

/**
 * Lặp một lệnh của core cho từng id đã chọn (core chưa có endpoint hàng loạt), gom lỗi theo dòng bằng
 * câu của core.
 */
async function eachCall(
  input: BulkInput,
  call: (id: string) => Promise<Outcome<unknown>>,
): Promise<BulkResult> {
  const result = await eachId(cleanIds(input.ids), async (id) => {
    const answer = await call(id);
    return answer.ok ? null : answer.problem.detail;
  });
  refresh();
  return result;
}

/** Gửi lại nhiều lời mời (thanh hàng loạt): mỗi lời mời có link mới, link cũ hết hiệu lực. */
export async function bulkResendInvites(input: BulkInput): Promise<BulkResult> {
  return eachCall(input, (id) =>
    send((client) =>
      client.POST("/api/v1/auth/invitations/{id}/resend", { params: { path: { id } } }),
    ),
  );
}

/** Thu hồi nhiều lời mời (thanh hàng loạt); lời mời đã nhận hay đã thu hồi thì core báo lỗi. */
export async function bulkRevokeInvites(input: BulkInput): Promise<BulkResult> {
  return eachCall(input, (id) =>
    send((client) => client.DELETE("/api/v1/auth/invitations/{id}", { params: { path: { id } } })),
  );
}

// ---------------------------------------------------------------- Uỷ quyền

const DELEGATE_FIELDS = ["child_tenant_id", "role_id", "reason", "expires_at"];

/** Cho người giữ một role của khách này làm việc ở khách con với role đó (`POST /auth/delegations`). */
export async function delegateRole(state: FormState, formData: FormData): Promise<FormState> {
  const typed = values(formData, ["child_tenant_id", "role_id", "reason", "expires_at"]);
  const t = await getTranslations("access.required");
  const fields: Record<string, string> = {};
  if (!typed.child_tenant_id) fields.child_tenant_id = t("field");
  if (!typed.role_id) fields.role_id = t("role");
  if (!typed.reason) fields.reason = t("reason");
  if (Object.keys(fields).length > 0) return { fields, values: typed };
  const result = await send((client) =>
    client.POST("/api/v1/auth/delegations", {
      body: {
        child_tenant_id: typed.child_tenant_id ?? "",
        role_id: typed.role_id ?? "",
        reason: typed.reason ?? "",
        // Ô ngày (`YYYY-MM-DD`) → hết ngày đó theo UTC; trống: tới khi thu hồi.
        ...(typed.expires_at ? { expires_at: `${typed.expires_at}T23:59:59Z` } : {}),
      },
    }),
  );
  if (!result.ok) return { ...problemState(result.problem, DELEGATE_FIELDS), values: typed };
  return done(state);
}

export async function revokeDelegation(state: FormState, formData: FormData): Promise<FormState> {
  const result = await send((client) =>
    client.DELETE("/api/v1/auth/delegations/{id}", {
      params: { path: { id: text(formData, "id") } },
    }),
  );
  if (!result.ok) return problemState(result.problem, []);
  return done(state);
}

/** Thu hồi nhiều uỷ quyền (thanh hàng loạt); lặp `DELETE /auth/delegations/{id}`. */
export async function bulkRevokeDelegations(input: BulkInput): Promise<BulkResult> {
  return eachCall(input, (id) =>
    send((client) => client.DELETE("/api/v1/auth/delegations/{id}", { params: { path: { id } } })),
  );
}

// ---------------------------------------------------------------- Quyền vào hỗ trợ

/**
 * Bật / tắt cho nhân sự nền tảng vào hỗ trợ: cài đặt `auth.support_access` ở nút gốc (core chỉ đọc
 * cài đặt này ở gốc).
 */
export async function saveSupportAccess(state: FormState, formData: FormData): Promise<FormState> {
  const root = await rootUnit();
  if (!root) {
    const t = await getTranslations("errors");
    return { error: t("failed"), code: "org_not_found" };
  }
  const result = await send((client) =>
    client.PUT("/api/v1/organizations/units/{id}/settings/{key}", {
      params: { path: { id: root.id, key: "auth.support_access" } },
      body: { value: formData.get("enabled") === "on" },
    }),
  );
  if (!result.ok) return problemState(result.problem, []);
  return done(state);
}

/** Khách thu hồi một lần cấp quyền vào hỗ trợ (không thu hồi được lần cấp theo yêu cầu cơ quan). */
export async function revokeGrant(state: FormState, formData: FormData): Promise<FormState> {
  const result = await send((client) =>
    client.DELETE("/api/v1/auth/support-access/{id}", {
      params: { path: { id: text(formData, "id") } },
    }),
  );
  if (!result.ok) return problemState(result.problem, []);
  return done(state);
}
