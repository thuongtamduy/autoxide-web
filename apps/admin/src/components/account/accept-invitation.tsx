"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { acceptInvitationAsMe } from "@/app/(admin)/account/actions";
import { FormAlert } from "@/components/ui/form";

/** Nút "Nhận lời mời" bằng tài khoản đang đăng nhập; xong thì báo và dẫn về Tổng quan. */
export function AcceptMine({ token, email }: { token: string; email: string }) {
  const t = useTranslations("account.invitation");
  const [state, action, pending] = useActionState(acceptInvitationAsMe, {});
  if (state.done) {
    return (
      <p className="note" role="status">
        {t("done")} <Link href="/">{t("home")}</Link>
      </p>
    );
  }
  return (
    <form action={action} className="card dlg-form padded">
      <input type="hidden" name="token" value={token} />
      <p>{t("intro", { email })}</p>
      <FormAlert state={state} />
      <div className="dlg-acts">
        <button type="submit" className="btn pri" disabled={pending}>
          {t("submit")}
        </button>
      </div>
    </form>
  );
}
