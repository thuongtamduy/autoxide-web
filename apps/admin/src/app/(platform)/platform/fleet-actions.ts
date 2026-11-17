"use server";

// Chạy migration các database của khách (placement) bằng API của core (D-334): một lượt chạy bằng job,
// một lượt một lúc (`kernel.migration_run_busy`). Core kiểm `kernel.tenants.operate` và người gọi là
// nhân sự khách nền tảng. `main` không migrate qua API (máy chủ tự migrate trước khi chạy).
import { refresh } from "next/cache";
import { send } from "@/lib/action";
import { type FormState, nextDone, problemState } from "@/lib/form";

/** Migrate một placement (`id` là tên placement) hay mọi placement (`id` rỗng). */
export async function runMigrations(state: FormState, formData: FormData): Promise<FormState> {
  const placement = String(formData.get("id") ?? "").trim();
  const result = await send((client) =>
    client.POST("/api/v1/kernel/placements/migrations", {
      body: { dry_run: false, ...(placement ? { placement } : {}) },
    }),
  );
  if (!result.ok) return problemState(result.problem, []);
  refresh();
  return { done: nextDone(state) };
}
