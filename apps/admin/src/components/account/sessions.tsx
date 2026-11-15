"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { endOtherSessions, endSession } from "@/app/(admin)/account/actions";
import { Dialog } from "./dialog";
import { DialogButtons, FormAlert, useOnDone, useSubmit } from "./form";
import { useToast } from "./toast";

/** Đăng xuất một thiết bị khác ngay trên dòng của nó. */
export function EndSessionButton({ id, device }: { id: string; device: string }) {
  const t = useTranslations("account.sessions");
  const toast = useToast();
  const [state, action, pending] = useSubmit(endSession, () => toast(t("ended")));
  return (
    <form action={action} className="inline-form">
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        className="btn sm danger"
        disabled={pending}
        aria-label={t("endLabel", { device })}
      >
        {t("end")}
      </button>
      <FormAlert state={state} />
    </form>
  );
}

/** "Đăng xuất mọi thiết bị khác": hỏi lại, nêu rõ hệ quả. */
export function EndOthersDialog({ others }: { others: number }) {
  const t = useTranslations("account.sessions");
  return (
    <Dialog
      label={t("endOthers")}
      title={t("endOthersTitle")}
      intro={t("endOthersIntro", { count: others })}
      triggerClass="btn sm danger"
      hideTrigger={others === 0}
    >
      {(close) => <EndOthers close={close} />}
    </Dialog>
  );
}

function EndOthers({ close }: { close: () => void }) {
  const t = useTranslations("account.sessions");
  const toast = useToast();
  const [state, action, pending] = useActionState(endOtherSessions, {});
  useOnDone(state.done, () => {
    close();
    toast(t("endedOthers", { count: state.ended ?? 0 }));
  });
  return (
    <form action={action} className="dlg-form">
      <FormAlert state={state} />
      <DialogButtons submit={t("endOthersSubmit")} pending={pending} close={close} danger />
    </form>
  );
}
