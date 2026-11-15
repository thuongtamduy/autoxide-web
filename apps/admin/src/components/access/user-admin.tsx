"use client";

import { useTranslations } from "next-intl";
import { useActionState, useRef } from "react";
import {
  deleteUser,
  endUserSessions,
  removeUserMfa,
  sendResetMail,
  setFirstPassword,
} from "@/app/(admin)/org/access/actions";
import { Dialog } from "@/components/ui/dialog";
import { DialogButtons, Field, FormAlert, useFocusInvalid, useOnDone } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";

// Thao tác của quản trị viên trên tài khoản người khác. Mỗi thao tác một dòng: tên, câu nêu hệ
// quả, nút. Thao tác không hoàn tác được hay cắt quyền vào của người đó thì hỏi lại trong hộp
// thoại, nêu rõ chuyện gì xảy ra.

interface Target {
  id: string;
  email: string;
  who: string;
}

/** Đặt mật khẩu đầu tiên (chỉ cho tài khoản tạo không có mật khẩu). */
export function FirstPasswordDialog({ target }: { target: Target }) {
  const t = useTranslations("access.admin.password");
  return (
    <Dialog label={t("open")} title={t("title", { who: target.who })} intro={t("intro")}>
      {(close) => <FirstPasswordForm target={target} close={close} />}
    </Dialog>
  );
}

function FirstPasswordForm({ target, close }: { target: Target; close: () => void }) {
  const t = useTranslations("access.admin.password");
  const toast = useToast();
  const form = useRef<HTMLFormElement>(null);
  const [state, action, pending] = useActionState(setFirstPassword, {});
  useFocusInvalid(form, state);
  useOnDone(state.done, () => {
    close();
    toast(t("done"));
  });
  return (
    <form ref={form} action={action} noValidate className="dlg-form">
      <input type="hidden" name="id" value={target.id} />
      <Field
        label={t("password")}
        name="password"
        type="password"
        autoComplete="new-password"
        hint={t("rule")}
        error={state.fields?.password}
        autoFocus
      />
      <FormAlert state={state} />
      <DialogButtons submit={t("submit")} pending={pending} close={close} />
    </form>
  );
}

/** Gửi thư đặt lại mật khẩu tới người dùng (người đó tự chọn mật khẩu mới). */
export function ResetMailButton({ target }: { target: Target }) {
  const t = useTranslations("access.admin.reset");
  const toast = useToast();
  const [state, action, pending] = useActionState(sendResetMail, {});
  useOnDone(state.done, () => toast(t("sent", { email: target.email })));
  return (
    <form action={action} className="inline-form">
      <input type="hidden" name="email" value={target.email} />
      <button type="submit" className="btn sm" disabled={pending}>
        {t("open")}
      </button>
      <FormAlert state={state} />
    </form>
  );
}

/** Đăng xuất người dùng ở mọi thiết bị. */
export function EndSessionsDialog({ target }: { target: Target }) {
  const t = useTranslations("access.admin.sessions");
  return (
    <Dialog
      label={t("open")}
      title={t("title", { who: target.who })}
      triggerClass="btn sm danger"
      intro={
        <ul className="dlg-list">
          <li>{t("now")}</li>
          <li>{t("tokens")}</li>
          <li>{t("keepOut")}</li>
        </ul>
      }
    >
      {(close) => <EndSessionsForm target={target} close={close} />}
    </Dialog>
  );
}

function EndSessionsForm({ target, close }: { target: Target; close: () => void }) {
  const t = useTranslations("access.admin.sessions");
  const toast = useToast();
  const [state, action, pending] = useActionState(endUserSessions, {});
  useOnDone(state.done, () => {
    close();
    toast(t("done", { count: state.ended ?? 0 }));
  });
  return (
    <form action={action} className="dlg-form">
      <input type="hidden" name="id" value={target.id} />
      <FormAlert state={state} />
      <DialogButtons submit={t("submit")} pending={pending} close={close} danger />
    </form>
  );
}

/** Tắt xác thực hai bước cho người mất thiết bị. */
export function RemoveMfaDialog({ target }: { target: Target }) {
  const t = useTranslations("access.admin.mfa");
  return (
    <Dialog
      label={t("open")}
      title={t("title", { who: target.who })}
      triggerClass="btn sm danger"
      intro={
        <ul className="dlg-list">
          <li>{t("effect")}</li>
          <li>{t("check")}</li>
        </ul>
      }
    >
      {(close) => <RemoveMfaForm target={target} close={close} />}
    </Dialog>
  );
}

function RemoveMfaForm({ target, close }: { target: Target; close: () => void }) {
  const t = useTranslations("access.admin.mfa");
  const toast = useToast();
  const [state, action, pending] = useActionState(removeUserMfa, {});
  useOnDone(state.done, () => {
    close();
    toast(t("done"));
  });
  return (
    <form action={action} className="dlg-form">
      <input type="hidden" name="id" value={target.id} />
      <FormAlert state={state} />
      <DialogButtons submit={t("submit")} pending={pending} close={close} danger />
    </form>
  );
}

/** Xoá tài khoản: nêu rõ hệ quả, gõ lại email của người đó để xác nhận. */
export function DeleteUserDialog({ target }: { target: Target }) {
  const t = useTranslations("access.user.delete");
  return (
    <Dialog
      label={t("open")}
      title={t("title", { who: target.who })}
      triggerClass="btn sm danger"
      intro={
        <ul className="dlg-list">
          <li>{t("goesNow")}</li>
          <li>{t("goesLater")}</li>
          <li>{t("noUndo")}</li>
        </ul>
      }
    >
      {(close) => <DeleteUserForm target={target} close={close} />}
    </Dialog>
  );
}

function DeleteUserForm({ target, close }: { target: Target; close: () => void }) {
  const t = useTranslations("access.user.delete");
  const form = useRef<HTMLFormElement>(null);
  const [state, action, pending] = useActionState(deleteUser, {});
  useFocusInvalid(form, state);
  return (
    <form ref={form} action={action} noValidate className="dlg-form">
      <input type="hidden" name="id" value={target.id} />
      <input type="hidden" name="email" value={target.email} />
      <Field
        label={t("confirm", { email: target.email })}
        name="confirm_email"
        type="email"
        autoComplete="off"
        mono
        defaultValue={state.values?.confirm_email}
        error={state.fields?.confirm_email}
        autoFocus
      />
      <FormAlert state={state} />
      <DialogButtons submit={t("submit")} pending={pending} close={close} danger />
    </form>
  );
}
