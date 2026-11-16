"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { restoreRevision } from "@/app/(admin)/content/actions";
import { Dialog } from "@/components/ui/dialog";
import { DialogButtons } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";

/**
 * "Khôi phục thành bản nháp": chép phiên bản về bản nháp của bài (`If-Match` với phiên bản của bài
 * đọc lúc mở trang). Bản đang đăng không đổi tới khi đăng lại.
 */
export function RestoreRevisionButton({
  entryId,
  revisionId,
  version,
  label,
}: {
  entryId: string;
  revisionId: string;
  version: string;
  label: string;
}) {
  const t = useTranslations("structure.history");
  const toast = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  return (
    <Dialog label={t("restore")} title={t("restoreTitle", { label })} intro={t("restoreIntro")}>
      {(close) => (
        <form
          className="dlg-form"
          onSubmit={(event) => {
            event.preventDefault();
            start(async () => {
              const result = await restoreRevision(entryId, revisionId, version);
              if (result.ok) {
                close();
                toast(t("restored"));
                router.refresh();
              } else {
                setError(
                  result.problem.code === "precondition_failed"
                    ? t("conflict")
                    : result.problem.detail,
                );
              }
            });
          }}
        >
          {error ? (
            <p role="alert" className="falert">
              {error}
            </p>
          ) : null}
          <DialogButtons submit={t("restore")} pending={pending} close={close} />
        </form>
      )}
    </Dialog>
  );
}
