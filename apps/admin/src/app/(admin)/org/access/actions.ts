"use server";

// Server Action của màn "Người dùng và role". Mọi lời gọi core chạy ở máy chủ với token lấy từ
// cookie `httpOnly`. Core kiểm quyền (`auth.users.manage`, `auth.roles.manage`), luật dữ liệu và
// các ràng buộc (quản trị viên cuối cùng, role dựng sẵn); ở đây chỉ kiểm ô bắt buộc để báo sớm
// và gom mọi lỗi một lần.
import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { send } from "@/lib/action";
import { type FormState, nextDone, parseForm, problemState } from "@/lib/form";

const USERS = "/org/access/users";
const ROLES = "/org/access/roles";

/** Câu "hãy điền ô này" theo từng ô. */
async function required(): Promise<{ fallback: string; messages: Record<string, string> }> {
  const t = await getTranslations("access.required");
  return {
    fallback: t("field"),
    messages: {
      email: t("email"),
      name: t("name"),
      password: t("password"),
      confirm_email: t("confirm_email"),
      role_name: t("role_name"),
    },
  };
}

function idOf(formData: FormData): string {
  return String(formData.get("id") ?? "");
}

/** Giá trị gõ dở để điền lại form sau khi báo lỗi (không gồm mật khẩu). */
function typed(formData: FormData, names: readonly string[]): Record<string, string> {
  return Object.fromEntries(names.map((name) => [name, String(formData.get(name) ?? "")]));
}

// ---------------------------------------------------------------- Người dùng

const CreateUserForm = z.object({
  email: z.string().trim().min(1),
  name: z.string().trim().min(1),
  password: z.string().optional(),
});

/** Tạo tài khoản; xong mở trang của người đó để gán role (tài khoản mới chưa có role nào). */
export async function createUser(_state: FormState, formData: FormData): Promise<FormState> {
  const { fallback, messages } = await required();
  const values = typed(formData, ["email", "name"]);
  const input = parseForm(CreateUserForm, formData, fallback, messages);
  if (!input.ok) return { fields: input.fields, values };
  const { password, ...rest } = input.data;
  const result = await send((client) =>
    client.POST("/api/v1/auth/users", { body: password ? { ...rest, password } : rest }),
  );
  if (!result.ok) {
    return {
      ...problemState(result.problem, ["email", "name", "password"], {
        "auth.email_taken": "email",
      }),
      values,
    };
  }
  redirect(`${USERS}/${result.data.data.id}?created=1`);
}

const RenameForm = z.object({ name: z.string().trim().min(1) });

/** Đổi tên hiển thị. Gửi `If-Match` để không ghi đè thay đổi của người khác. */
export async function renameUser(state: FormState, formData: FormData): Promise<FormState> {
  const { fallback, messages } = await required();
  const values = typed(formData, ["name"]);
  const input = parseForm(RenameForm, formData, fallback, messages);
  if (!input.ok) return { fields: input.fields, values };
  const etag = String(formData.get("etag") ?? "");
  const result = await send((client) =>
    client.PATCH("/api/v1/auth/users/{id}", {
      params: { path: { id: idOf(formData) }, header: etag ? { "If-Match": etag } : {} },
      body: { name: input.data.name },
    }),
  );
  if (!result.ok) return { ...problemState(result.problem, ["name"]), values };
  refresh();
  return { done: nextDone(state) };
}

/** Khoá (`disabled=true`: đăng xuất mọi nơi, token ngừng chạy ngay) hoặc mở khoá tài khoản. */
export async function setUserDisabled(state: FormState, formData: FormData): Promise<FormState> {
  const disabled = formData.get("disabled") === "true";
  const result = await send((client) =>
    client.PATCH("/api/v1/auth/users/{id}", {
      params: { path: { id: idOf(formData) } },
      body: { disabled },
    }),
  );
  if (!result.ok) return problemState(result.problem, []);
  refresh();
  return { done: nextDone(state) };
}

/** Thay toàn bộ role của người dùng bằng các ô đang chọn (`role_id`, có thể không ô nào). */
export async function setUserRoles(state: FormState, formData: FormData): Promise<FormState> {
  const roleIds = formData.getAll("role_id").map(String);
  const result = await send((client) =>
    client.PUT("/api/v1/auth/users/{id}/roles", {
      params: { path: { id: idOf(formData) } },
      body: { role_ids: roleIds },
    }),
  );
  if (!result.ok) return problemState(result.problem, []);
  refresh();
  return { done: nextDone(state) };
}

const PasswordForm = z.object({ password: z.string().min(1) });

/** Đặt mật khẩu đầu tiên cho tài khoản tạo không có mật khẩu (core không cho thay mật khẩu đã có). */
export async function setFirstPassword(state: FormState, formData: FormData): Promise<FormState> {
  const { fallback, messages } = await required();
  const input = parseForm(PasswordForm, formData, fallback, messages);
  if (!input.ok) return { fields: input.fields };
  const result = await send((client) =>
    client.PUT("/api/v1/auth/users/{id}/password", {
      params: { path: { id: idOf(formData) } },
      body: input.data,
    }),
  );
  if (!result.ok) {
    // Đã có mật khẩu (đặt ở nơi khác): tải lại để dòng này biến mất.
    if (result.problem.code === "auth.password_already_set") refresh();
    return problemState(result.problem, ["password"]);
  }
  refresh();
  return { done: nextDone(state) };
}

/**
 * Gửi thư đặt lại mật khẩu tới người dùng: cùng endpoint công khai như "Quên mật khẩu?", vì
 * quản trị viên không được đặt thay mật khẩu đã có. Core luôn trả 202.
 */
export async function sendResetMail(state: FormState, formData: FormData): Promise<FormState> {
  const email = String(formData.get("email") ?? "");
  const result = await send(
    (client) => client.POST("/api/v1/auth/password-reset", { body: { email } }),
    { guest: true },
  );
  if (!result.ok) return problemState(result.problem, []);
  return { done: nextDone(state) };
}

export interface EndedState extends FormState {
  ended?: number;
}

/** Đăng xuất người dùng ở mọi thiết bị. */
export async function endUserSessions(state: EndedState, formData: FormData): Promise<EndedState> {
  const result = await send((client) =>
    client.DELETE("/api/v1/auth/users/{id}/sessions", {
      params: { path: { id: idOf(formData) } },
    }),
  );
  if (!result.ok) return problemState(result.problem, []);
  return { done: nextDone(state), ended: result.data.data.ended };
}

/** Tắt xác thực hai bước cho người mất thiết bị. */
export async function removeUserMfa(state: FormState, formData: FormData): Promise<FormState> {
  const result = await send((client) =>
    client.DELETE("/api/v1/auth/users/{id}/mfa", { params: { path: { id: idOf(formData) } } }),
  );
  if (!result.ok) {
    if (result.problem.code === "auth.mfa_not_enabled") refresh();
    return problemState(result.problem, []);
  }
  refresh();
  return { done: nextDone(state) };
}

/** Gỡ một passkey của người khác (mất thiết bị). Mật khẩu và phiên của họ giữ nguyên. */
export async function removeUserPasskey(state: FormState, formData: FormData): Promise<FormState> {
  const passkey = String(formData.get("passkey_id") ?? "");
  const result = await send((client) =>
    client.DELETE("/api/v1/auth/users/{id}/passkeys/{passkey_id}", {
      params: { path: { id: idOf(formData), passkey_id: passkey } },
    }),
  );
  if (!result.ok) return problemState(result.problem, []);
  refresh();
  return { done: nextDone(state) };
}

/** Gỡ mọi passkey của người khác: họ đăng nhập lại bằng mật khẩu rồi thêm passkey mới. */
export async function removeAllUserPasskeys(
  state: FormState,
  formData: FormData,
): Promise<FormState> {
  const result = await send((client) =>
    client.DELETE("/api/v1/auth/users/{id}/passkeys", { params: { path: { id: idOf(formData) } } }),
  );
  if (!result.ok) return problemState(result.problem, []);
  refresh();
  return { done: nextDone(state) };
}

const DeleteUserForm = z.object({ confirm_email: z.string().trim().min(1) });

/** Xoá tài khoản: gõ lại email của người đó để xác nhận. Xong về danh sách. */
export async function deleteUser(_state: FormState, formData: FormData): Promise<FormState> {
  const { fallback, messages } = await required();
  const values = typed(formData, ["confirm_email"]);
  const input = parseForm(DeleteUserForm, formData, fallback, messages);
  if (!input.ok) return { fields: input.fields, values };
  const email = String(formData.get("email") ?? "");
  if (input.data.confirm_email.toLowerCase() !== email.toLowerCase()) {
    const t = await getTranslations("access.user.delete");
    return { fields: { confirm_email: t("mismatch", { email }) }, values };
  }
  const result = await send((client) =>
    client.DELETE("/api/v1/auth/users/{id}", { params: { path: { id: idOf(formData) } } }),
  );
  if (!result.ok) return { ...problemState(result.problem, []), values };
  redirect(`${USERS}?deleted=1`);
}

// ---------------------------------------------------------------- Role

const RoleForm = z.object({
  role_name: z.string().trim().min(1),
  description: z.string().trim().optional(),
});

function roleBody(formData: FormData, input: z.output<typeof RoleForm>) {
  return {
    name: input.role_name,
    description: input.description ?? "",
    permissions: formData.getAll("permission").map(String),
  };
}

/**
 * Lỗi của core cho role: trường `name` của core là ô `role_name` ở form (tránh trùng `name` của
 * người dùng trong cùng bộ câu báo).
 */
function roleProblem(problem: Parameters<typeof problemState>[0]): FormState {
  const renamed = {
    ...problem,
    ...(problem.errors
      ? {
          errors: problem.errors.map((entry) =>
            entry.field === "name" ? { ...entry, field: "role_name" } : entry,
          ),
        }
      : {}),
  };
  return problemState(renamed, ["role_name", "description", "permissions"], {
    "auth.role_name_taken": "role_name",
  });
}

/** Tạo role; xong mở trang của role đó. */
export async function createRole(_state: FormState, formData: FormData): Promise<FormState> {
  const { fallback, messages } = await required();
  const values = typed(formData, ["role_name", "description"]);
  const input = parseForm(RoleForm, formData, fallback, messages);
  if (!input.ok) return { fields: input.fields, values };
  const result = await send((client) =>
    client.POST("/api/v1/auth/roles", { body: roleBody(formData, input.data) }),
  );
  if (!result.ok) return { ...roleProblem(result.problem), values };
  redirect(`${ROLES}/${result.data.data.id}?created=1`);
}

/** Sửa role (tên, mô tả, permission) với `If-Match`: ai vừa sửa giữa chừng thì core trả 412. */
export async function updateRole(state: FormState, formData: FormData): Promise<FormState> {
  const { fallback, messages } = await required();
  const values = typed(formData, ["role_name", "description"]);
  const input = parseForm(RoleForm, formData, fallback, messages);
  if (!input.ok) return { fields: input.fields, values };
  const etag = String(formData.get("etag") ?? "");
  const result = await send((client) =>
    client.PUT("/api/v1/auth/roles/{id}", {
      params: { path: { id: idOf(formData) }, header: etag ? { "If-Match": etag } : {} },
      body: roleBody(formData, input.data),
    }),
  );
  if (!result.ok) return { ...roleProblem(result.problem), values };
  refresh();
  return { done: nextDone(state) };
}

/** Xoá role; người đang giữ role mất nó ở request kế tiếp. */
export async function deleteRole(_state: FormState, formData: FormData): Promise<FormState> {
  const result = await send((client) =>
    client.DELETE("/api/v1/auth/roles/{id}", { params: { path: { id: idOf(formData) } } }),
  );
  if (!result.ok) return problemState(result.problem, []);
  redirect(`${ROLES}?deleted=1`);
}
