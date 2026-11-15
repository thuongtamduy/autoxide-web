"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { reportEmailChange } from "../actions";
import { PublicAlert } from "../field";

export function NotMeForm({ token }: { token: string }) {
  const t = useTranslations("public.notMe");
  const [state, action, pending] = useActionState(reportEmailChange, {});
  if (state.done) {
    return (
      <>
        <CardHeader>
          <CardTitle>{t("doneTitle")}</CardTitle>
          <CardDescription role="status">{t("done")}</CardDescription>
        </CardHeader>
        <CardContent>
          <Link className="text-sm underline" href="/login">
            {t("toLogin")}
          </Link>
        </CardContent>
      </>
    );
  }
  // Token sai, đã dùng, hết hạn hay tài khoản đã xoá: core trả chung một mã, không cho dò gì.
  const invalid = state.code === "auth.invalid_email_change_report_token";
  return (
    <>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={action} className="grid gap-4">
          <input type="hidden" name="token" value={token} />
          <p className="text-sm text-muted-foreground">{t("effects")}</p>
          <PublicAlert error={state.error} code={state.code} />
          {invalid ? <p className="text-sm text-muted-foreground">{t("invalidHint")}</p> : null}
          <Button type="submit" disabled={pending}>
            {t("submit")}
          </Button>
        </form>
      </CardContent>
    </>
  );
}
