// Xác nhận lại là chính mình trước lệnh nhạy cảm (đổi email, bật xác thực hai bước, thêm passkey, xoá
// tài khoản — `POST /auth/me/reauth` của core): kiểu dùng chung cho máy chủ và trình duyệt.

/** Cách xác nhận: mật khẩu, mã của app xác thực, hay một passkey đã có. */
export type ConfirmMethod = "password" | "totp" | "passkey";
export const CONFIRM_METHODS: readonly ConfirmMethod[] = ["password", "totp", "passkey"];

/** Cách xác nhận tài khoản này dùng được (có mật khẩu, bật app xác thực, có passkey). */
export type ConfirmMethods = Readonly<Record<ConfirmMethod, boolean>>;

/** Các cách đem ra cho người dùng chọn, theo thứ tự cố định. */
export function offeredMethods(methods: ConfirmMethods): ConfirmMethod[] {
  return CONFIRM_METHODS.filter((m) => methods[m]);
}
