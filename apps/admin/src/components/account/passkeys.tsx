"use client";

import { useTranslations } from "next-intl";
import { type FormEvent, useRef, useState, useTransition } from "react";
import { finishPasskey, removePasskey, startPasskey } from "@/app/(admin)/account/actions";
import { ConfirmFields, signForProof } from "@/components/account/confirm-identity";
import { Dialog } from "@/components/ui/dialog";
import { DialogButtons, Field, FormAlert, useFocusInvalid, useSubmit } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import type { ConfirmMethods } from "@/lib/confirm";
import type { FormState } from "@/lib/form";
import { ceremonyErrorKey, creationOptionsJson, passkeysSupported } from "@/lib/webauthn";

export function AddPasskeyDialog({ methods }: { methods: ConfirmMethods }) {
  const t = useTranslations("account.passkeys");
  return (
    <Dialog label={t("add")} title={t("addTitle")} intro={t("addIntro")} triggerClass="btn sm pri">
      {(close) => <AddPasskey close={close} methods={methods} />}
    </Dialog>
  );
}

/**
 * Thêm passkey. Chỉ phần ký chạy ở trình duyệt: options lấy qua Server Action (máy chủ gọi
 * core bằng token trong cookie), authenticator của máy tạo khoá, kết quả gửi lại qua Server
 * Action. Khoá riêng không bao giờ rời authenticator.
 */
function AddPasskey({ close, methods }: { close: () => void; methods: ConfirmMethods }) {
  const t = useTranslations("account.passkeys");
  const tc = useTranslations("account.confirm");
  const toast = useToast();
  const form = useRef<HTMLFormElement>(null);
  const [state, setState] = useState<FormState>({});
  const [pending, startTransition] = useTransition();
  useFocusInvalid(form, state);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    if (!passkeysSupported()) {
      setState({ error: t("unsupported"), code: "account.webauthn_unsupported" });
      return;
    }
    startTransition(async () => {
      // Xác nhận bằng passkey đã có: ký trước, rồi mới tạo passkey mới.
      const refused = await signForProof(data, tc);
      if (refused) {
        setState(refused);
        return;
      }
      const started = await startPasskey(data);
      if (started.options === undefined) {
        setState(started);
        return;
      }
      let credential: unknown;
      try {
        const publicKey = PublicKeyCredential.parseCreationOptionsFromJSON(
          creationOptionsJson(started.options),
        );
        const created = await navigator.credentials.create({ publicKey });
        if (!(created instanceof PublicKeyCredential)) throw new Error("no credential");
        credential = created.toJSON();
      } catch (error) {
        const key = ceremonyErrorKey(error);
        setState({ error: t(key), code: `account.webauthn_${key}`, values: started.values ?? {} });
        return;
      }
      const finished = await finishPasskey(started.values?.name ?? "", credential);
      if (finished.done) {
        close();
        toast(t("added"));
        return;
      }
      setState(finished);
    });
  }

  return (
    <form ref={form} onSubmit={submit} noValidate className="dlg-form">
      <Field
        label={t("name")}
        name="name"
        hint={t("nameHint")}
        maxLength={100}
        defaultValue={state.values?.name}
        error={state.fields?.name}
        autoFocus
      />
      <ConfirmFields methods={methods} state={state} />
      <FormAlert state={state} />
      <DialogButtons submit={t("addSubmit")} pending={pending} close={close} />
    </form>
  );
}

export function RemovePasskeyDialog({ id, name }: { id: string; name: string }) {
  const t = useTranslations("account.passkeys");
  return (
    <Dialog
      label={t("remove")}
      title={t("removeTitle", { name })}
      intro={t("removeIntro")}
      triggerClass="btn sm danger"
    >
      {(close) => <RemovePasskey id={id} close={close} />}
    </Dialog>
  );
}

function RemovePasskey({ id, close }: { id: string; close: () => void }) {
  const t = useTranslations("account.passkeys");
  const toast = useToast();
  const [state, action, pending] = useSubmit(removePasskey, () => {
    close();
    toast(t("removed"));
  });
  return (
    <form action={action} className="dlg-form">
      <input type="hidden" name="id" value={id} />
      <FormAlert state={state} />
      <DialogButtons submit={t("removeSubmit")} pending={pending} close={close} danger />
    </form>
  );
}
