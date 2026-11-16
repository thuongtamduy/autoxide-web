"use client";

// Biểu mẫu của tab "Tên miền" (W-032), gọi core thật qua Server Action ở
// `app/(admin)/settings/domain-actions.ts`: thêm tên miền, kiểm tra ngay. Gỡ dùng `ConfirmAction`.
import { useTranslations } from "next-intl";
import { useActionState, useRef } from "react";
import { addDomain, type VerifyState, verifyDomain } from "@/app/(admin)/settings/domain-actions";
import { Dialog } from "@/components/ui/dialog";
import {
  DialogButtons,
  Field,
  FormAlert,
  useFocusInvalid,
  useOnDone,
  useSubmit,
} from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { explainSingleMode } from "@/lib/domains";

/** "Thêm tên miền": một ô; xong thì danh sách hiện bản ghi TXT cần đặt. */
export function AddDomainDialog() {
  const t = useTranslations("settings.domains");
  return (
    <Dialog label={t("add")} title={t("addTitle")} intro={t("addIntro")} triggerClass="btn sm pri">
      {(close) => <AddDomainForm close={close} />}
    </Dialog>
  );
}

function AddDomainForm({ close }: { close: () => void }) {
  const t = useTranslations("settings.domains");
  const toast = useToast();
  const form = useRef<HTMLFormElement>(null);
  const [state, action, pending] = useActionState(addDomain, {});
  useFocusInvalid(form, state);
  useOnDone(state.done, () => {
    close();
    toast(t("added"));
  });
  return (
    <form ref={form} action={action} noValidate className="dlg-form">
      <Field
        label={t("domain")}
        name="domain"
        autoComplete="off"
        mono
        placeholder="shop.example.com"
        hint={t("domainHint")}
        defaultValue={state.values?.domain}
        error={state.fields?.domain}
        autoFocus
      />
      <FormAlert state={explainSingleMode(state, t("singleModeError"))} />
      <DialogButtons submit={t("addSubmit")} pending={pending} close={close} />
    </form>
  );
}

/**
 * "Kiểm tra ngay": core tra DNS và luôn trả trạng thái mới. Báo đúng kết quả — đã xác minh, hay chưa
 * thấy bản ghi (kèm lý do của core) — thay vì một câu "đã kiểm" chung.
 */
export function VerifyDomainButton({ id, domain }: { id: string; domain: string }) {
  const t = useTranslations("settings.domains");
  const toast = useToast();
  const [state, run, pending] = useSubmit<VerifyState>(verifyDomain, (next) =>
    toast(
      next.status === "verified"
        ? t("verifiedNow", { domain })
        : next.checkError
          ? t("notYetBecause", { reason: next.checkError })
          : t("notYet"),
    ),
  );
  return (
    <form action={run} className="inline-form">
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        className="btn sm"
        disabled={pending}
        aria-label={t("verifyLabel", { domain })}
      >
        {pending ? t("verifying") : t("verify")}
      </button>
      <FormAlert state={state} />
    </form>
  );
}
