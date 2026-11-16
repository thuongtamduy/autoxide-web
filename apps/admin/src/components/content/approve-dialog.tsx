"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { approveEntry } from "@/app/(admin)/content/actions";
import { Dialog } from "@/components/ui/dialog";
import { CheckField, DialogButtons } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";

/**
 * Nút "Duyệt và đăng" trên dòng bài chờ duyệt của danh sách. Bài có phần AI viết thì người duyệt phải
 * xác nhận đã đọc lại (như hộp Đăng của trình soạn); lỗi của core (412 vì ai đó vừa sửa, thiếu quyền
 * `_own`) hiện trong hộp thoại.
 */
export function ApproveDialog({
  id,
  title,
  aiGenerated,
}: {
  id: string;
  title: string;
  aiGenerated: boolean;
}) {
  const t = useTranslations("content.approve");
  const tp = useTranslations("content.publish");
  const toast = useToast();
  const [pending, start] = useTransition();
  const [errors, setErrors] = useState<{ review?: string; core?: string }>({});
  return (
    <Dialog
      label={t("open")}
      ariaLabel={t("openFor", { title })}
      title={t("title", { title })}
      intro={t("intro")}
      triggerClass="btn sm pri"
    >
      {(close) => (
        <form
          className="dlg-form"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            const reviewed = new FormData(event.currentTarget).get("ai_reviewed") === "on";
            if (aiGenerated && !reviewed) {
              setErrors({ review: tp("reviewRequired") });
              return;
            }
            setErrors({});
            start(async () => {
              const result = await approveEntry(id, reviewed);
              if (result.ok) {
                toast(tp("published"));
                close();
              } else {
                setErrors({ core: result.problem.detail });
              }
            });
          }}
        >
          {aiGenerated ? (
            <div className="fld">
              <CheckField
                label={tp("aiReviewed")}
                hint={tp("aiReviewedHint")}
                name="ai_reviewed"
                aria-invalid={errors.review ? true : undefined}
                aria-describedby={errors.review ? `approve-${id}-err` : undefined}
              />
              {errors.review ? (
                <span id={`approve-${id}-err`} className="ferr">
                  {errors.review}
                </span>
              ) : null}
            </div>
          ) : null}
          {errors.core ? (
            <p role="alert" className="falert">
              {errors.core}
            </p>
          ) : null}
          <p className="fhint">{tp("permission")}</p>
          <DialogButtons submit={t("submit")} pending={pending} close={close} />
        </form>
      )}
    </Dialog>
  );
}
