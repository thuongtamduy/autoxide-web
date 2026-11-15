import "server-only";

import { type AutoxideClient, type Problem, toApiError } from "@autoxide/sdk";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { coreClient } from "./core";

// Gọi core từ một Server Action thay mặt người đang đăng nhập. Khác `load` (dùng cho trang):
// lỗi không ném ra mà trả về, để form hiện `detail` dưới đúng ô; core không trả lời thì thành
// một Problem `core_unreachable` có câu báo theo ngôn ngữ của giao diện.

type Result<T> = { data?: T; error?: unknown; response: Response };

export type Outcome<T> = { ok: true; data: T } | { ok: false; problem: Problem };

export async function send<T>(
  call: (client: AutoxideClient) => Promise<Result<T>>,
): Promise<Outcome<T>> {
  let result: Result<T>;
  try {
    result = await call(await coreClient());
  } catch {
    const t = await getTranslations("login");
    return {
      ok: false,
      problem: {
        type: "about:blank",
        title: "Service Unavailable",
        status: 503,
        code: "core_unreachable",
        detail: t("unreachable"),
      },
    };
  }
  const { data, error, response } = result;
  if (response.ok) {
    // 202 / 204 không có thân: `data` là undefined, đúng như kiểu của endpoint đó.
    return { ok: true, data: data as T };
  }
  if (response.status === 401) {
    redirect("/login");
  }
  return { ok: false, problem: toApiError(response, error).problem };
}
