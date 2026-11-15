// Đọc lỗi của core cho form công khai: core đã dịch `detail` theo `Accept-Language` (CLAUDE.md:
// "hiện `detail` của core"), nên website chỉ ghép câu của core, không tự viết lại.
import type { Problem } from "@autoxide/sdk";

export function isProblem(value: unknown): value is Problem {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { code?: unknown }).code === "string" &&
    typeof (value as { detail?: unknown }).detail === "string"
  );
}

/** Câu báo lỗi cho người đọc: `detail`, kèm lỗi từng trường (nếu có) sau dấu ":". */
export function problemMessage(problem: Problem): string {
  const fields = (problem.errors ?? []).map((e) => `${e.field}: ${e.detail}`);
  return fields.length > 0 ? `${problem.detail} (${fields.join("; ")})` : problem.detail;
}
