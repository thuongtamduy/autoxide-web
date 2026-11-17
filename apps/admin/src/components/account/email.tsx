"use client";

import { useTranslations } from "next-intl";
import { useActionState, useRef } from "react";
import {
  cancelEmailChange,
  changeEmail,
  resendVerification,
  sendPasswordLink,
} from "@/app/(admin)/account/actions";
import { ConfirmFields, signForProof } from "@/components/account/confirm-identity";
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
import type { ConfirmMethods } from "@/lib/confirm";
import type { FormState } from "@/lib/form";

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

/** Huỷ yêu cầu đổi email đang chờ xác minh; email hiện tại giữ nguyên. */
export function CancelEmailChange({ email }: { email: string }) {
  const t = useTranslations("account.email");
  const toast = useToast();
  // `useSubmit`: dòng email đang chờ (cùng nút này) biến mất khi trang làm mới, nên báo ngay.
  const [state, action, pending] = useSubmit(cancelEmailChange, () =>
    toast(t("cancelled", { email })),
  );
  return (
    <form action={action} className="inline-form">
      <button type="submit" className="btn sm" disabled={pending}>
        {t("cancelChange")}
      </button>
      <FormAlert state={state} />
    </form>
  );
}

/**
 * Tài khoản chưa có mật khẩu: xin thư có link đặt mật khẩu đầu tiên (core gửi tới chính email của
 * tài khoản — cách core chọn để chỉ chủ hộp thư đặt được).
 */
export function PasswordLinkButton({ email }: { email: string }) {
  const t = useTranslations("account.password");
  const toast = useToast();
  const [state, action, pending] = useActionState(sendPasswordLink, {});
  useOnDone(state.done, () => toast(t("linkSent", { email })));
  return (
    <form action={action} className="inline-form">
      <button type="submit" className="btn sm pri" disabled={pending}>
        {t("sendLink")}
      </button>
      <FormAlert state={state} />
    </form>
  );
}

export function ChangeEmailDialog({ methods }: { methods: ConfirmMethods }) {
  const t = useTranslations("account.email");
  return (
    <Dialog label={t("change")} title={t("changeTitle")} intro={t("changeIntro")}>
      {(close) => <ChangeEmailForm close={close} methods={methods} />}
    </Dialog>
  );
}

function ChangeEmailForm({ close, methods }: { close: () => void; methods: ConfirmMethods }) {
  const t = useTranslations("account.email");
  const tc = useTranslations("account.confirm");
  const toast = useToast();
  const form = useRef<HTMLFormElement>(null);
  const [state, action, pending] = useActionState(
    async (previous: FormState, data: FormData) =>
      (await signForProof(data, tc)) ?? changeEmail(previous, data),
    {},
  );
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
      <ConfirmFields methods={methods} state={state} />
      <FormAlert state={state} />
      <DialogButtons submit={t("submit")} pending={pending} close={close} />
    </form>
  );
}
