import { toApiError } from "@autoxide/sdk";
import { coreClient } from "@/lib/core";
import { SUBMISSION_STATUSES } from "@/lib/forms";

// Xuất bài nộp của một form ra CSV: máy chủ của giao diện gọi core bằng token trong cookie rồi
// trả tệp cho trình duyệt, nên token không xuống trình duyệt. Core đã chặn ô bắt đầu bằng
// `=`, `+`, `-`, `@` (chèn `'`) để bảng tính không chạy công thức; tệp đi nguyên như core trả.
export async function GET(
  request: Request,
  context: RouteContext<"/marketing/forms/[id]/export">,
): Promise<Response> {
  const { id } = await context.params;
  const wanted = new URL(request.url).searchParams.get("status");
  const status = SUBMISSION_STATUSES.find((s) => s === wanted);
  const client = await coreClient();
  let result: Awaited<ReturnType<typeof callExport>>;
  try {
    result = await callExport(client, id, status);
  } catch {
    return problem(503, "core_unreachable", "The Autoxide server does not answer.");
  }
  const { data, error, response } = result;
  if (response.ok && typeof data === "string") {
    const day = new Date().toISOString().slice(0, 10);
    const name = (response.headers.get("content-disposition") ?? "").match(/filename="?([^";]+)"?/);
    return new Response(data, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${name?.[1] ?? `form-${id}-${day}.csv`}"`,
        "Cache-Control": "no-store",
      },
    });
  }
  if (response.status === 401) {
    return Response.redirect(
      new URL(`/login?next=${encodeURIComponent(`/marketing/forms/${id}`)}`, request.url),
      303,
    );
  }
  const failure = toApiError(response, error);
  return problem(failure.status, failure.code, failure.problem.detail);
}

function callExport(
  client: Awaited<ReturnType<typeof coreClient>>,
  id: string,
  status: (typeof SUBMISSION_STATUSES)[number] | undefined,
) {
  return client.GET("/api/v1/forms/{id}/submissions/export", {
    params: { path: { id }, query: { format: "csv", ...(status ? { status } : {}) } },
    parseAs: "text",
  });
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
