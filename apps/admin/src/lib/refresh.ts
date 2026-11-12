// Đổi refresh token lấy cặp token mới, mỗi refresh token đúng một lần.
//
// Core chỉ nhận mỗi refresh token MỘT lần, và gửi lại token đã dùng bị coi là dấu hiệu
// token bị đánh cắp (`auth.refresh_token_reused`). Trình duyệt hay gửi nhiều request cùng lúc
// (tải trang, prefetch link), mỗi request đều thấy access token đã hết: nếu mỗi cái tự làm mới
// thì cái thứ hai bị từ chối. Vì vậy các request đồng thời mang cùng refresh token dùng chung
// một lời gọi, và kết quả được giữ thêm một lúc cho request tới trễ.
//
// Giới hạn: chỉ gộp được trong MỘT tiến trình. Chạy nhiều bản trang quản trị sau load balancer
// thì bật sticky session (xem README).
import { createAutoxideClient, type TokenResponse, toApiError } from "@autoxide/sdk";

export type RefreshResult =
  | { ok: true; tokens: TokenResponse }
  | { ok: false; status: number; code: string };

/** Kết quả được giữ chừng này mili giây sau khi xong. */
const KEEP_MS = 10_000;

const pending = new Map<string, Promise<RefreshResult>>();

export interface RefreshOptions {
  baseUrl: string;
  fetch?: (request: Request) => Promise<Response>;
}

export function refreshTokens(
  refreshToken: string,
  options: RefreshOptions,
): Promise<RefreshResult> {
  const existing = pending.get(refreshToken);
  if (existing) {
    return existing;
  }
  const result = exchange(refreshToken, options);
  pending.set(refreshToken, result);
  void result.finally(() => {
    setTimeout(() => pending.delete(refreshToken), KEEP_MS).unref?.();
  });
  return result;
}

async function exchange(refreshToken: string, options: RefreshOptions): Promise<RefreshResult> {
  const client = createAutoxideClient({
    baseUrl: options.baseUrl,
    ...(options.fetch ? { fetch: options.fetch } : {}),
  });
  try {
    const { data, error, response } = await client.POST("/api/v1/auth/refresh", {
      body: { refresh_token: refreshToken },
    });
    if (data) {
      return { ok: true, tokens: data.data };
    }
    const failure = toApiError(response, error);
    return { ok: false, status: failure.status, code: failure.code };
  } catch {
    // Core không trả lời: không xoá phiên, để lần sau thử lại.
    return { ok: false, status: 503, code: "core_unreachable" };
  }
}

/** Chỉ cho test: quên các kết quả đang giữ. */
export function forgetRefreshes(): void {
  pending.clear();
}
