"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { suggestCopyAction } from "@/app/(admin)/catalog/actions";
import { FormAlert, SelectField, useOnDone } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import type { FormState } from "@/lib/form";

/**
 * "Gợi ý mô tả bằng AI": chỉ tạo một bản nháp chờ người xem, không đổi sản phẩm. Chỉ bật khi core
 * báo AI đang bật (`GET /ai/status`, gọi thật); không thì tắt kèm lý do.
 */
export function SuggestForm({ id, enabled }: { id: string; enabled: boolean }) {
  const t = useTranslations("catalog.ai");
  const toast = useToast();
  const [state, run, pending] = useActionState<FormState, FormData>(suggestCopyAction, {});
  useOnDone(state.done, () => toast(t("suggested")));
  return (
    <form action={run} className="card padded cat-suggest">
      <input type="hidden" name="id" value={id} />
      <SelectField
        label={t("locale")}
        name="locale"
        defaultValue="vi"
        options={[
          { value: "vi", label: "Tiếng Việt" },
          { value: "en", label: "English" },
        ]}
        disabled={!enabled}
      />
      <button type="submit" className="btn" disabled={!enabled || pending}>
        {t("suggest")}
      </button>
      {enabled ? null : <p className="fhint">{t("off")}</p>}
      <FormAlert state={state} />
    </form>
  );
}
