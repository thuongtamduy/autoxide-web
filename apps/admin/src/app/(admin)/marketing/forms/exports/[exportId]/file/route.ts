import { toApiError } from "@autoxide/sdk";
import { coreClient } from "@/lib/core";
import { coreUrl } from "@/lib/env";

// Tải tệp của một lượt xuất chạy nền. Core trả `download_url` có chữ ký và hạn, mở được không cần đăng
// nhập; máy chủ của giao diện xin link mới (cần `forms.export`, token trong cookie) rồi tự tải về và
// chuyển cho trình duyệt. Trình duyệt không cần gọi thẳng tới core, và link có chữ ký không lộ ra ngoài.
// Chỉ lấy đường dẫn của link rồi ghép vào địa chỉ core mà giao diện đang dùng: địa chỉ công khai của
// core (`AUTOXIDE_HTTP_PUBLIC_URL`) chưa chắc gọi được từ máy chủ này.
export async function GET(
  request: Request,
  context: RouteContext<"/marketing/forms/exports/[exportId]/file">,
): Promise<Response> {
  const { exportId } = await context.params;
  try {
    const client = await coreClient();
    const { data, error, response } = await client.GET("/api/v1/forms/exports/{export_id}", {
      params: { path: { export_id: exportId } },
    });
    if (response.status === 401) {
      return Response.redirect(new URL("/login?next=%2Fmarketing%2Fforms", request.url), 303);
    }
    if (!data) {
      const failure = toApiError(response, error);
      return problem(failure.status, failure.code, failure.problem.detail);
    }
    const link = data.data.download_url;
    if (data.data.state !== "ready" || !link) {
      return problem(
        409,
        "forms.export_not_ready",
        "The export is not ready yet; try again shortly.",
      );
    }
    const signed = new URL(link, coreUrl());
    const file = await fetch(new URL(`${signed.pathname}${signed.search}`, coreUrl()));
    if (!file.ok || !file.body) {
      return problem(
        file.status || 502,
        "forms.export_download_failed",
        "The file could not be read.",
      );
    }
    const name = (file.headers.get("content-disposition") ?? "").match(/filename="?([^";]+)"?/);
    return new Response(file.body, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${name?.[1] ?? `form-export-${exportId}.csv`}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return problem(503, "core_unreachable", "The Autoxide server does not answer.");
  }
}

function problem(status: number, code: string, detail: string): Response {
  return Response.json(
    { type: "about:blank", title: "Error", status, code, detail },
    {
      status,
      headers: { "Content-Type": "application/problem+json", "Cache-Control": "no-store" },
    },
  );
}
