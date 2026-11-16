import { coreUrl } from "@/lib/env";

// Tải hợp đồng API của core (`/api/v1/openapi.json`, công khai) về như một file. Đi qua máy chủ của
// ứng dụng để trình duyệt tải được cả khi core chỉ mở trong mạng nội bộ.
export async function GET(): Promise<Response> {
  const response = await fetch(`${coreUrl()}/api/v1/openapi.json`, { cache: "no-store" });
  if (!response.ok) {
    return new Response(await response.text(), {
      status: 502,
      headers: { "Content-Type": "application/problem+json" },
    });
  }
  return new Response(await response.text(), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": 'attachment; filename="autoxide-openapi.json"',
    },
  });
}
