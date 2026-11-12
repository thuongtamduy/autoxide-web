// Phiên đăng nhập của trang quản trị: token của core cất trong cookie `httpOnly`.
//
// Trình duyệt không bao giờ đọc được token (D-097 của core): mọi lời gọi core đi qua máy
// chủ Next.js, máy chủ lấy token từ cookie rồi gắn vào header `Authorization`.
import type { MfaChallenge, TokenResponse } from "@autoxide/sdk";

export const ACCESS_COOKIE = "ax_access";
export const REFRESH_COOKIE = "ax_refresh";
export const MFA_COOKIE = "ax_mfa";

/** Bớt chừng này giây khỏi hạn access token: cookie hết trước token, không gửi token sắp hết. */
const ACCESS_MARGIN_SECONDS = 30;

export interface CookieOptions {
  httpOnly: true;
  secure: boolean;
  sameSite: "lax";
  path: "/";
  maxAge?: number;
  expires?: Date;
}

export interface CookieToSet {
  name: string;
  value: string;
  options: CookieOptions;
}

function base(secure: boolean): CookieOptions {
  return { httpOnly: true, secure, sameSite: "lax", path: "/" };
}

/** Cookie cần đặt sau khi đăng nhập hay làm mới token. */
export function tokenCookies(tokens: TokenResponse, secure: boolean): CookieToSet[] {
  return [
    {
      name: ACCESS_COOKIE,
      value: tokens.access_token,
      options: {
        ...base(secure),
        maxAge: Math.max(tokens.expires_in - ACCESS_MARGIN_SECONDS, 1),
      },
    },
    {
      name: REFRESH_COOKIE,
      value: tokens.refresh_token,
      options: { ...base(secure), expires: new Date(tokens.refresh_token_expires_at) },
    },
  ];
}

/** Cookie giữ `mfa_token` giữa bước mật khẩu và bước nhập mã. */
export function mfaCookie(challenge: MfaChallenge, secure: boolean): CookieToSet {
  return {
    name: MFA_COOKIE,
    value: challenge.mfa_token,
    options: { ...base(secure), maxAge: Math.max(challenge.expires_in, 1) },
  };
}

/**
 * Đích sau khi đăng nhập: chỉ nhận đường dẫn trong trang này (`/…`), không nhận `//host` hay
 * URL tuyệt đối — để link đăng nhập không đẩy được người dùng sang trang khác.
 */
export function safeNext(value: unknown): string {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) {
    return "/modules";
  }
  if (value.startsWith("/\\") || value.startsWith("/login")) {
    return "/modules";
  }
  return value;
}
