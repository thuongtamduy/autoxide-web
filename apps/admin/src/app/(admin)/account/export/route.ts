import { toApiError } from "@autoxide/sdk";
import { coreClient } from "@/lib/core";

// Tải dữ liệu của tôi: máy chủ gọi core bằng token trong cookie rồi trả file JSON cho trình
// duyệt, nên token không xuống trình duyệt. Phiên hết hạn thì proxy đã làm mới trước khi tới đây.
export async function GET(request: Request): Promise<Response> {
  const client = await coreClient();
  let result: Awaited<ReturnType<typeof callExport>>;
  try {
    result = await callExport(client);
  } catch {
    return problem(503, "core_unreachable", "The Autoxide server does not answer.");
  }
  const { data, error, response } = result;
  if (data) {
    const day = new Date().toISOString().slice(0, 10);
    return new Response(`${JSON.stringify(data.data, null, 2)}\n`, {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="autoxide-my-data-${day}.json"`,
        "Cache-Control": "no-store",
      },
    });
  }
  if (response.status === 401) {
    return Response.redirect(new URL("/login?next=%2Faccount%2Fdata", request.url), 303);
  }
  const failure = toApiError(response, error);
  return problem(failure.status, failure.code, failure.problem.detail);
}

function callExport(client: Awaited<ReturnType<typeof coreClient>>) {
  return client.GET("/api/v1/auth/me/export");
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
