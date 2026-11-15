"use client";

import { useTranslations } from "next-intl";
import { useActionState, useRef } from "react";
import { changeEmail, resendVerification } from "@/app/(admin)/account/actions";
import { Dialog } from "./dialog";
import { DialogButtons, Field, FormAlert, useFocusInvalid, useOnDone } from "./form";
import { useToast } from "./toast";

/** Nút gửi lại thư xác minh; lỗi (vd gửi quá nhanh) hiện ngay dưới nút. */
export function ResendVerification({ email }: { email: string }) {
  const t = useTranslations("account.email");
  const toast = useToast();
  const [state, action, pending] = useActionState(resendVerification, {});
  useOnDone(state.done, () => toast(t("sent", { email })));
  return (
    <form action={action} className="inline-form">
      <button type="submit" className="btn sm" disabled={pending}>
        {t("resend")}
      </button>
      <FormAlert state={state} />
    </form>
  );
}

export function ChangeEmailDialog() {
  const t = useTranslations("account.email");
  return (
    <Dialog label={t("change")} title={t("changeTitle")} intro={t("changeIntro")}>
      {(close) => <ChangeEmailForm close={close} />}
    </Dialog>
  );
}

function ChangeEmailForm({ close }: { close: () => void }) {
  const t = useTranslations("account.email");
  const toast = useToast();
  const form = useRef<HTMLFormElement>(null);
  const [state, action, pending] = useActionState(changeEmail, {});
  useFocusInvalid(form, state);
  useOnDone(state.done, () => {
    close();
    toast(t("sent", { email: state.values?.new_email ?? "" }));
  });
  return (
    <form ref={form} action={action} noValidate className="dlg-form">
      <Field
        label={t("new")}
        name="new_email"
        type="email"
        autoComplete="email"
        mono
        defaultValue={state.values?.new_email}
        error={state.fields?.new_email}
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
      <DialogButtons submit={t("submit")} pending={pending} close={close} />
    </form>
  );
}
