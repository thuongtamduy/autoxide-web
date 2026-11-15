"use client";

import { useTranslations } from "next-intl";
import { useActionState, useRef } from "react";
import { renameUser, setUserDisabled, setUserRoles } from "@/app/(admin)/org/access/actions";
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

/** Đổi tên hiển thị của người dùng (gửi kèm `ETag` đã đọc). */
export function RenameForm({ id, name, etag }: { id: string; name: string; etag: string | null }) {
  const t = useTranslations("access.user");
  const toast = useToast();
  const form = useRef<HTMLFormElement>(null);
  const [state, action, pending] = useActionState(renameUser, {});
  useFocusInvalid(form, state);
  useOnDone(state.done, () => toast(t("renamed")));
  return (
    <form ref={form} action={action} noValidate className="dlg-form">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="etag" value={etag ?? ""} />
      <Field
        label={t("name")}
        name="name"
        autoComplete="off"
        defaultValue={state.values?.name ?? name}
        error={state.fields?.name}
      />
      <FormAlert state={state} />
      <div className="dlg-acts">
        <button type="submit" className="btn pri" disabled={pending}>
          {t("rename")}
        </button>
      </div>
    </form>
  );
}

/** Mở khoá ngay; khoá thì hỏi lại và nêu hệ quả (đăng xuất mọi nơi, token ngừng chạy ngay). */
export function StatusControl({
  id,
  disabled,
  who,
}: {
  id: string;
  disabled: boolean;
  who: string;
}) {
  const t = useTranslations("access.user.status");
  const toast = useToast();
  // `useSubmit`: báo ngay khi xong, vì sau khi tải lại, nút này đổi thành nút "Khoá".
  const [state, action, pending] = useSubmit(setUserDisabled, () => toast(t("enabled")));
  if (disabled) {
    return (
      <form action={action} className="inline-form">
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="disabled" value="false" />
        <button type="submit" className="btn sm" disabled={pending}>
          {t("enable")}
        </button>
        <FormAlert state={state} />
      </form>
    );
  }
  return (
    <Dialog
      label={t("disable")}
      title={t("disableTitle", { who })}
      triggerClass="btn sm danger"
      intro={
        <ul className="dlg-list">
          <li>{t("disableNow")}</li>
          <li>{t("disableKeep")}</li>
          <li>{t("disableUndo")}</li>
        </ul>
      }
    >
      {(close) => <DisableForm id={id} close={close} />}
    </Dialog>
  );
}

function DisableForm({ id, close }: { id: string; close: () => void }) {
  const t = useTranslations("access.user.status");
  const toast = useToast();
  // Hộp thoại biến mất khi trang tải lại (nút đổi thành "Mở khoá"): báo ngay, không đợi effect.
  const [state, action, pending] = useSubmit(setUserDisabled, () => {
    close();
    toast(t("disabled"));
  });
  return (
    <form action={action} className="dlg-form">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="disabled" value="true" />
      <FormAlert state={state} />
      <DialogButtons submit={t("disableSubmit")} pending={pending} close={close} danger />
    </form>
  );
}

export interface RoleOption {
  id: string;
  name: string;
  description: string;
  all: boolean;
}

/** Gán role: mỗi role một ô chọn; lưu là thay toàn bộ danh sách role của người đó. */
export function RolesForm({
  id,
  roles,
  held,
}: {
  id: string;
  roles: RoleOption[];
  held: readonly string[];
}) {
  const t = useTranslations("access.user.roles");
  const toast = useToast();
  const [state, action, pending] = useActionState(setUserRoles, {});
  useOnDone(state.done, () => toast(t("saved")));
  return (
    <form action={action} className="card checks">
      <input type="hidden" name="id" value={id} />
      <fieldset>
        <legend className="vh">{t("legend")}</legend>
        {roles.map((role) => (
          <label key={role.id} className="check">
            <input
              type="checkbox"
              name="role_id"
              value={role.id}
              defaultChecked={held.includes(role.id)}
            />
            <span className="check-main">
              <span className="mono check-name">{role.name}</span>
              <span className="check-desc">
                {role.all ? t("everything") : role.description || t("noDescription")}
              </span>
            </span>
          </label>
        ))}
      </fieldset>
      <div className="checks-foot">
        <FormAlert state={state} />
        <button type="submit" className="btn pri" disabled={pending}>
          {t("save")}
        </button>
      </div>
    </form>
  );
}
