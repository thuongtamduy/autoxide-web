"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { deleteRole } from "@/app/(admin)/org/access/actions";
import { Dialog } from "@/components/ui/dialog";
import { DialogButtons, FormAlert } from "@/components/ui/form";

/** Xoá role: nêu hệ quả (người đang giữ mất quyền ở request kế tiếp, không hoàn tác). */
export function DeleteRoleDialog({ id, name }: { id: string; name: string }) {
  const t = useTranslations("access.role.delete");
  return (
    <Dialog
      label={t("open")}
      title={t("title", { name })}
      triggerClass="btn sm danger"
      intro={
        <ul className="dlg-list">
          <li>{t("holders")}</li>
          <li>{t("noUndo")}</li>
        </ul>
      }
    >
      {(close) => <DeleteRoleForm id={id} close={close} />}
    </Dialog>
  );
}

function DeleteRoleForm({ id, close }: { id: string; close: () => void }) {
  const t = useTranslations("access.role.delete");
  const [state, action, pending] = useActionState(deleteRole, {});
  return (
    <form action={action} className="dlg-form">
      <input type="hidden" name="id" value={id} />
      <FormAlert state={state} />
      <DialogButtons submit={t("submit")} pending={pending} close={close} danger />
    </form>
  );
}
