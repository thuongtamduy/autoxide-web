import "server-only";

// Đồ dùng phía máy chủ của phân hệ Tiếp thị: ghi có kiểm phiên bản (`If-Match`), lấy lỗi của
// trường lồng nhau (`fields[2].options`) và trạng thái trả về cho nút có Hoàn tác.
import type { AutoxideClient, Problem } from "@autoxide/sdk";
import { getTranslations } from "next-intl/server";
import { type Outcome, send } from "./action";
import type { ChangeState } from "./engage";
import { type FormState, problemState } from "./form";

export type { ChangeState };

type Result<T> = { data?: T; error?: unknown; response: Response };

/** 412 dựng sẵn khi bản ghi đã đổi kể từ lúc người dùng mở trang. */
export async function changedProblem(): Promise<Problem> {
  const t = await getTranslations("engage");
  return {
    type: "about:blank",
    title: "Precondition Failed",
    status: 412,
    code: "precondition_failed",
    detail: t("changed"),
  };
}

/**
 * Ghi một bản ghi có kiểm phiên bản. Đọc bản ghi để lấy `ETag`; nếu `updated_at` khác bản người
 * dùng đang thấy trên trang (`expect`) thì báo 412 và không ghi; giống thì ghi kèm `If-Match`, để
 * core cũng từ chối nếu có người sửa xen giữa hai lời gọi. Bảng danh sách không có `ETag` từng
 * dòng, nên nút trên dòng (duyệt một bình luận) cũng đi đường này.
 */
export async function versioned<R extends { data: { updated_at: string } }, W>(
  read: (client: AutoxideClient) => Promise<Result<R>>,
  expect: string | undefined,
  write: (client: AutoxideClient, etag: string) => Promise<Result<W>>,
): Promise<
  { ok: true; data: W; etag: string | null; before: R["data"] } | { ok: false; problem: Problem }
> {
  let etag: string | null = null;
  const current = await send(async (client) => {
    const result = await read(client);
    etag = result.response.headers.get("etag");
    return result;
  });
  if (!current.ok) return current;
  if (expect && current.data.data.updated_at !== expect) {
    return { ok: false, problem: await changedProblem() };
  }
  let next: string | null = null;
  const written: Outcome<W> = await send(async (client) => {
    const result = await write(client, etag ?? "*");
    next = result.response.headers.get("etag");
    return result;
  });
  if (!written.ok) return written;
  return { ok: true, data: written.data, etag: next, before: current.data.data };
}

/**
 * Như `problemState`, cho form có trường lồng nhau: lỗi có đường dẫn bắt đầu bằng một trong
 * `prefixes` (vd `fields[`) giữ nguyên đường dẫn làm tên ô, để trình sửa gắn vào đúng thẻ.
 */
export function nestedProblemState(
  problem: Problem,
  fields: readonly string[],
  prefixes: readonly string[] = [],
  codeField: Readonly<Record<string, string>> = {},
): FormState {
  const nested = (problem.errors ?? [])
    .map((entry) => entry.field)
    .filter((field) => prefixes.some((prefix) => field.startsWith(prefix)));
  return problemState(problem, [...fields, ...nested], codeField);
}

/** Chữ của một ô form (trống nếu không có). */
export function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

/** Số nguyên của một ô; trống thì `null`, không phải số thì `undefined` (để báo lỗi). */
export function integerField(formData: FormData, name: string): number | null | undefined {
  const text = field(formData, name);
  if (text === "") return null;
  return /^-?\d+$/.test(text) ? Number(text) : undefined;
}
