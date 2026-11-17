"use client";

import { useTranslations } from "next-intl";
import { useActionState, useRef } from "react";
import { deleteAccount } from "@/app/(admin)/account/actions";
import { ConfirmFields, signForProof } from "@/components/account/confirm-identity";
import { Dialog } from "@/components/ui/dialog";
import { DialogButtons, Field, FormAlert, useFocusInvalid } from "@/components/ui/form";
import type { ConfirmMethods } from "@/lib/confirm";
import type { FormState } from "@/lib/form";

/** Xoá tài khoản: nêu rõ hệ quả, gõ lại email và xác nhận là bạn (mật khẩu, mã hay passkey). */
export function DeleteAccountDialog({
  email,
  methods,
}: {
  email: string;
  methods: ConfirmMethods;
}) {
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
      {(close) => <DeleteForm email={email} close={close} methods={methods} />}
    </Dialog>
  );
}

function DeleteForm({
  email,
  close,
  methods,
}: {
  email: string;
  close: () => void;
  methods: ConfirmMethods;
}) {
  const t = useTranslations("account.delete");
  const tc = useTranslations("account.confirm");
  const form = useRef<HTMLFormElement>(null);
  const [state, action, pending] = useActionState(
    async (previous: FormState, data: FormData) =>
      (await signForProof(data, tc)) ?? deleteAccount(previous, data),
    {},
  );
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
      <ConfirmFields methods={methods} state={state} />
      <FormAlert state={state} />
      <DialogButtons submit={t("submit")} pending={pending} close={close} danger />
    </form>
  );
}
