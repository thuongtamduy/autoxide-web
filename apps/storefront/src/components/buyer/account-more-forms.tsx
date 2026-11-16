"use client";

import { useTranslations } from "next-intl";
import { useActionState, useEffect, useId, useState } from "react";
import { addEvidence, claimWarranty, type FormResult } from "@/sample/account-more-actions";
import { EVIDENCE_LIMITS } from "@/sample/account-more-state";
import { ErrorSummary, ErrorText, errorFor } from "./form-errors";

const IDLE: FormResult = { status: "idle", errors: [] };

/**
 * Yêu cầu bảo hành cho một món còn hạn: mô tả lỗi; cách gửi (mang tới cửa hàng / gửi bưu cục) chọn ở
 * bước sau với cửa hàng. Mẫu; thay bằng `POST /api/v1/orders/me/warranties/{id}/claims` (bước 45).
 */
export function WarrantyClaim({ sku, name }: { sku: string; name: string }) {
  const t = useTranslations("account.warranty");
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(claimWarranty, IDLE);
  const id = useId();
  if (!open) {
    return (
      <button type="button" className="btn sm" onClick={() => setOpen(true)}>
        {t("claim")}
      </button>
    );
  }
  const error = (field: string) => errorFor(state.errors, field);
  return (
    <form
      action={action}
      className="acx-return pop"
      noValidate
      aria-label={t("claimTitle", { name })}
    >
      <input type="hidden" name="sku" value={sku} />
      <b>{t("claimTitle", { name })}</b>
      <ErrorSummary errors={state.errors} />
      <ErrorText id={`${id}-sku`} error={error("sku")} />
      <label className="lab" htmlFor={`${id}-note`}>
        {t("claimNote")}
      </label>
      <textarea
        id={`${id}-note`}
        name="note"
        className={`inp${error("note") ? " err" : ""}`}
        rows={3}
        aria-invalid={error("note") ? true : undefined}
        aria-describedby={error("note") ? `${id}-note-err` : undefined}
      />
      <ErrorText id={`${id}-note-err`} error={error("note")} />
      <span className="muted">{t("claimAfter")}</span>
      <span className="acx-acts">
        <button type="submit" className="btn sm pri" disabled={pending}>
          {t("claimSend")}
        </button>
        <button type="button" className="btn sm ghost" onClick={() => setOpen(false)}>
          {t("claimCancel")}
        </button>
      </span>
    </form>
  );
}

/**
 * Gửi thêm bằng chứng cho tranh chấp đang mở: vài dòng và / hoặc ảnh. Mẫu: ảnh chỉ gửi TÊN file (ô
 * chọn file không có `name`, tên đi qua ô ẩn) — chưa có nơi nhận ảnh thật (module `media` của core,
 * bước 46). Tin đã gửi không sửa, không xoá được.
 */
export function EvidenceForm() {
  const t = useTranslations("account.disputes");
  const [state, action, pending] = useActionState(addEvidence, IDLE);
  const [photos, setPhotos] = useState<string[]>([]);
  const id = useId();
  const error = (field: string) => errorFor(state.errors, field);
  // Gửi xong: React tự xoá chữ trong form; tên ảnh đã chọn (state) thì xoá ở đây.
  useEffect(() => {
    if (state.status === "ok") setPhotos([]);
  }, [state]);
  return (
    <form action={action} className="acx-return" noValidate aria-label={t("addTitle")}>
      <b>{t("addTitle")}</b>
      {state.status === "ok" ? (
        <p className="by-ok" role="status">
          {t("sent")}
        </p>
      ) : null}
      <ErrorSummary errors={state.errors} />
      <label className="lab" htmlFor={`${id}-body`}>
        {t("addBody")}
      </label>
      <textarea
        id={`${id}-body`}
        name="body"
        className={`inp${error("body") ? " err" : ""}`}
        rows={3}
        maxLength={EVIDENCE_LIMITS.body}
        aria-invalid={error("body") ? true : undefined}
        aria-describedby={error("body") ? `${id}-body-err` : undefined}
      />
      <ErrorText id={`${id}-body-err`} error={error("body")} />
      <label className="lab" htmlFor={`${id}-photo`}>
        {t("addPhotos", { max: EVIDENCE_LIMITS.photos })}
      </label>
      <input
        id={`${id}-photo`}
        type="file"
        accept="image/*,video/*"
        multiple
        aria-describedby={`${id}-photo-hint`}
        onChange={(event) => setPhotos(Array.from(event.target.files ?? []).map((f) => f.name))}
      />
      {photos.map((name) => (
        <input key={name} type="hidden" name="photo" value={name} />
      ))}
      <span className="muted" id={`${id}-photo-hint`}>
        {t("photosHint")}
      </span>
      <ErrorText id={`${id}-photo-err`} error={error("photo")} />
      <span className="acx-acts">
        <button type="submit" className="btn sm pri" disabled={pending}>
          {t("addSend")}
        </button>
      </span>
    </form>
  );
}
