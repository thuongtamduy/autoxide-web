"use server";

// Server Action của tab "Tên miền" (W-032) gọi core THẬT (`/kernel/domains`, D-291 của core). Core
// kiểm permission (`kernel.domains.manage`), chuẩn hoá và kiểm tên miền, tra DNS; ở đây chỉ kiểm ô
// bắt buộc để báo sớm. Bản cài một khách (`single`) trả 409 `tenant_single_mode`: form giữ `code` để
// hiện lời giải thích thay vì câu lỗi trần.
import { refresh } from "next/cache";
import { getTranslations } from "next-intl/server";
import { send } from "@/lib/action";
import { type FormState, nextDone, problemState } from "@/lib/form";

/** Trạng thái của lần "Kiểm tra ngay": trạng thái mới và lý do còn chờ, để báo đúng kết quả. */
export interface VerifyState extends FormState {
  status?: string;
  checkError?: string | null;
}

function idOf(formData: FormData): string {
  return String(formData.get("id") ?? "");
}

/** Thêm tên miền (`POST /kernel/domains`): xong thì danh sách hiện bản ghi TXT cần đặt. */
export async function addDomain(state: FormState, formData: FormData): Promise<FormState> {
  const domain = String(formData.get("domain") ?? "").trim();
  if (!domain) {
    const t = await getTranslations("settings.domains");
    return { fields: { domain: t("required") } };
  }
  const result = await send((client) =>
    client.POST("/api/v1/kernel/domains", { body: { domain } }),
  );
  if (!result.ok) {
    return {
      ...problemState(result.problem, ["domain"], {
        tenant_domain_invalid: "domain",
        tenant_domain_taken: "domain",
      }),
      values: { domain },
    };
  }
  refresh();
  return { done: nextDone(state) };
}

/**
 * Tra bản ghi TXT ngay (`POST /kernel/domains/{id}/verify`). Core luôn trả 200 kèm trạng thái mới;
 * lý do còn chờ ở `check_error` — trả cả hai để nút báo "đã xác minh" hay "chưa thấy bản ghi".
 */
export async function verifyDomain(state: VerifyState, formData: FormData): Promise<VerifyState> {
  const id = idOf(formData);
  const result = await send((client) =>
    client.POST("/api/v1/kernel/domains/{id}/verify", { params: { path: { id } } }),
  );
  if (!result.ok) return problemState(result.problem, []);
  refresh();
  return {
    done: nextDone(state),
    status: result.data.data.status,
    checkError: result.data.data.check_error ?? null,
  };
}

/** Gỡ tên miền (`DELETE /kernel/domains/{id}`): core đánh dấu `revoked`, request tới nó thôi vào khách. */
export async function removeDomain(state: FormState, formData: FormData): Promise<FormState> {
  const id = idOf(formData);
  const result = await send((client) =>
    client.DELETE("/api/v1/kernel/domains/{id}", { params: { path: { id } } }),
  );
  if (!result.ok) return problemState(result.problem, []);
  refresh();
  return { done: nextDone(state) };
}
