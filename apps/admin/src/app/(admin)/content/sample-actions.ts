"use server";

// Server Action cho phần màn Nội dung dùng dữ liệu mẫu (W-006): trang bắt buộc của website và
// bài thuộc website nào. Gọi hàm mẫu của `src/sample/content.ts` thay cho API của bước 37 (và
// phần "mới") của core; trả lỗi cùng hình dạng Problem như phần gọi core thật.
import type { Problem } from "@autoxide/sdk";
import { refresh } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { sampleDataEnabled } from "@/sample";
import { draftFromTemplate, setEntryWebsite } from "@/sample/content";

type Result = { ok: true } | { ok: false; problem: Problem };

async function guard(): Promise<Result | null> {
  if (sampleDataEnabled()) return null;
  const t = await getTranslations("sample");
  return {
    ok: false,
    problem: {
      type: "about:blank",
      title: "Not Found",
      status: 404,
      code: "sample_data_off",
      detail: t("off"),
    },
  };
}

const id = z.uuid();

/** Tạo bản nháp của một trang bắt buộc từ mẫu. */
export async function draftRequiredPage(websiteId: string, pageKind: string): Promise<Result> {
  const off = await guard();
  if (off) return off;
  if (!id.safeParse(websiteId).success) return { ok: false, problem: invalid() };
  const result = await draftFromTemplate(websiteId, pageKind.slice(0, 64));
  if (!result.ok) return result;
  refresh();
  return { ok: true };
}

/** Gắn bài với một website. */
export async function moveToWebsite(entryId: string, websiteId: string): Promise<Result> {
  const off = await guard();
  if (off) return off;
  if (!id.safeParse(entryId).success || !id.safeParse(websiteId).success) {
    return { ok: false, problem: invalid() };
  }
  const result = await setEntryWebsite(entryId, websiteId);
  if (!result.ok) return result;
  refresh();
  return { ok: true };
}

function invalid(): Problem {
  return {
    type: "about:blank",
    title: "Bad Request",
    status: 400,
    code: "invalid_request",
    detail: "The request is not valid.",
  };
}
