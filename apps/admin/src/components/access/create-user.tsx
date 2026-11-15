"use client";

import { useTranslations } from "next-intl";
import { useActionState, useRef } from "react";
import { createUser } from "@/app/(admin)/org/access/actions";
import { Dialog } from "@/components/ui/dialog";
import { DialogButtons, Field, FormAlert, useFocusInvalid } from "@/components/ui/form";

/** Nút "Tạo người dùng" ở đầu màn và hộp thoại của nó. Xong thì mở trang người đó để gán role. */
export function CreateUserDialog() {
  const t = useTranslations("access.create");
  return (
    <Dialog label={t("open")} title={t("title")} intro={t("intro")} triggerClass="btn pri">
      {(close) => <CreateUserForm close={close} />}
    </Dialog>
  );
}

function CreateUserForm({ close }: { close: () => void }) {
  const t = useTranslations("access.create");
  const form = useRef<HTMLFormElement>(null);
  const [state, action, pending] = useActionState(createUser, {});
  useFocusInvalid(form, state);
  return (
    <form ref={form} action={action} noValidate className="dlg-form">
      <Field
        label={t("email")}
        name="email"
        type="email"
        autoComplete="off"
        mono
        defaultValue={state.values?.email}
        error={state.fields?.email}
        hint={t("emailHint")}
        autoFocus
      />
      <Field
        label={t("name")}
        name="name"
        autoComplete="off"
        defaultValue={state.values?.name}
        error={state.fields?.name}
      />
      <Field
        label={t("password")}
        name="password"
        type="password"
        autoComplete="new-password"
        hint={t("passwordHint")}
        error={state.fields?.password}
      />
      <FormAlert state={state} />
      <DialogButtons submit={t("submit")} pending={pending} close={close} />
    </form>
  );
}
