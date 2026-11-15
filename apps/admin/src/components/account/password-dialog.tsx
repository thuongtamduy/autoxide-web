"use client";

import { useTranslations } from "next-intl";
import { useActionState, useRef } from "react";
import { changePassword } from "@/app/(admin)/account/actions";
import { Dialog } from "./dialog";
import { DialogButtons, Field, FormAlert, useFocusInvalid, useOnDone } from "./form";
import { useToast } from "./toast";

/** Nút "Đổi mật khẩu" và hộp thoại của nó. */
export function PasswordDialog({ triggerClass }: { triggerClass?: string }) {
  const t = useTranslations("account.password");
  return (
    <Dialog
      label={t("change")}
      title={t("title")}
      intro={t("intro")}
      {...(triggerClass ? { triggerClass } : {})}
    >
      {(close) => <PasswordForm close={close} />}
    </Dialog>
  );
}

function PasswordForm({ close }: { close: () => void }) {
  const t = useTranslations("account.password");
  const toast = useToast();
  const form = useRef<HTMLFormElement>(null);
  const [state, action, pending] = useActionState(changePassword, {});
  useFocusInvalid(form, state);
  useOnDone(state.done, () => {
    close();
    toast(t("done"));
  });
  return (
    <form ref={form} action={action} noValidate className="dlg-form">
      <Field
        label={t("current")}
        name="current_password"
        type="password"
        autoComplete="current-password"
        error={state.fields?.current_password}
        autoFocus
      />
      <Field
        label={t("new")}
        name="new_password"
        type="password"
        autoComplete="new-password"
        hint={t("rule")}
        error={state.fields?.new_password}
      />
      <FormAlert state={state} />
      <DialogButtons submit={t("submit")} pending={pending} close={close} />
    </form>
  );
}
