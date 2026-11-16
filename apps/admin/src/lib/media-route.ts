import "server-only";

import { headers } from "next/headers";

// Đồ dùng chung của route `/media/…` (ảnh qua máy chủ, tải lên, thay nội dung).

/** Header của câu trả lời core được chuyển nguyên cho trình duyệt khi trả nội dung tệp. */
const PASSED = [
  "content-type",
  "content-length",
  "content-disposition",
  "content-range",
  "accept-ranges",
  "cache-control",
  "etag",
  "last-modified",
  "x-content-type-options",
  "content-security-policy",
];

export function passHeaders(from: Headers): Headers {
  const out = new Headers();
  for (const name of PASSED) {
    const value = from.get(name);
    if (value !== null) out.set(name, value);
  }
  return out;
}

/** Câu trả lời lỗi dạng Problem (RFC 9457), như core. */
export function problemResponse(status: number, code: string, detail: string): Response {
  return Response.json(
    { type: "about:blank", title: "Error", status, code, detail },
    { status, headers: { "Content-Type": "application/problem+json" } },
  );
}

/**
 * Lệnh ghi chỉ nhận từ chính trang quản trị: cookie đã là `SameSite=Lax` (trình duyệt không gửi nó
 * theo POST / PUT từ trang khác); kiểm thêm `Origin` như Next.js kiểm cho Server Action.
 */
export async function sameOrigin(): Promise<boolean> {
  const list = await headers();
  const origin = list.get("origin");
  if (!origin) return true;
  const host = list.get("x-forwarded-host") ?? list.get("host");
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

/**
 * Trả lại câu trả lời JSON của core (dữ liệu hay Problem, SDK đã đọc thành `body`), không kèm gì
 * của phiên.
 */
export function relayJson(response: Response, body: unknown): Response {
  const out = new Headers();
  const location = response.headers.get("location");
  if (location) out.set("location", location);
  const etag = response.headers.get("etag");
  if (etag) out.set("etag", etag);
  if (!response.ok && (typeof body !== "object" || body === null)) {
    return relayProblem(response.status, body);
  }
  out.set("content-type", response.ok ? "application/json" : "application/problem+json");
  return new Response(JSON.stringify(body ?? null), { status: response.status, headers: out });
}

/** Core không trả lời. */
export function coreUnreachable(): Response {
  return problemResponse(503, "core_unreachable", "The server cannot be reached. Try again.");
}

/** Lỗi của core (đã đọc thành `error`) trả lại nguyên dạng Problem. */
export function relayProblem(status: number, error: unknown): Response {
  const body =
    typeof error === "object" && error !== null && "code" in error
      ? error
      : {
          type: "about:blank",
          title: "Error",
          status,
          code: "http_error",
          detail: `The server answered ${status}.`,
        };
  return Response.json(body, {
    status,
    headers: { "Content-Type": "application/problem+json", "Cache-Control": "no-store" },
  });
}

/**
 * Thân request chuyển thẳng sang core (không chép cả tệp vào bộ nhớ). `duplex: "half"` là điều
 * kiện của `fetch` khi thân là dòng dữ liệu; kiểu của SDK mô tả thân là mảng byte nên ép kiểu.
 */
export function streamBody(request: Request) {
  return {
    body: request.body as never,
    bodySerializer: (body: unknown) => body as BodyInit,
    headers: { "Content-Type": request.headers.get("content-type") ?? "application/octet-stream" },
    duplex: "half",
  } as const;
}
