"use client";

import { useTranslations } from "next-intl";
import { useActionState, useRef } from "react";
import { deleteAccount } from "@/app/(admin)/account/actions";
import { Dialog } from "@/components/ui/dialog";
import { DialogButtons, Field, FormAlert, useFocusInvalid } from "@/components/ui/form";

/** Xoá tài khoản: nêu rõ hệ quả, gõ lại email và mật khẩu để xác nhận. */
export function DeleteAccountDialog({ email }: { email: string }) {
  const t = useTranslations("account.delete");
  return (
    <Dialog
      label={t("open")}
      title={t("title")}
      triggerClass="btn sm danger"
      intro={
        <>
          <p>{t("intro")}</p>
          <ul className="dlg-list">
            <li>{t("goesNow")}</li>
            <li>{t("goesLater")}</li>
            <li>{t("noUndo")}</li>
          </ul>
        </>
      }
    >
      {(close) => <DeleteForm email={email} close={close} />}
    </Dialog>
  );
}

function DeleteForm({ email, close }: { email: string; close: () => void }) {
  const t = useTranslations("account.delete");
  const form = useRef<HTMLFormElement>(null);
  const [state, action, pending] = useActionState(deleteAccount, {});
  useFocusInvalid(form, state);
  return (
    <form ref={form} action={action} noValidate className="dlg-form">
      <Field
        label={t("confirmEmail", { email })}
        name="confirm_email"
        type="email"
        autoComplete="off"
        mono
        defaultValue={state.values?.confirm_email}
        error={state.fields?.confirm_email}
        autoFocus
      />
      <Field
        label={t("password")}
        name="current_password"
        type="password"
        autoComplete="current-password"
        error={state.fields?.current_password}
      />
      <FormAlert state={state} />
      <DialogButtons submit={t("submit")} pending={pending} close={close} danger />
    </form>
  );
}
