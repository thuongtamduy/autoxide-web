"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { acceptInvitation } from "../actions";
import { PublicAlert, PublicField } from "../field";

/** Nhận lời mời bằng tài khoản mới: tên, mật khẩu (không bắt buộc). Xong thì core đăng nhập luôn. */
export function AcceptForm({ token, signIn }: { token: string; signIn: string }) {
  const t = useTranslations("public.invitation");
  const [state, action, pending] = useActionState(acceptInvitation, {});
  if (state.done) {
    return (
      <CardHeader>
        <CardTitle>{t("doneTitle")}</CardTitle>
        <CardDescription role="status">{t("done")}</CardDescription>
      </CardHeader>
    );
  }
  const needsSignIn = state.code === "auth.invitation_sign_in_required";
  return (
    <>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={action} noValidate className="grid gap-4">
          <input type="hidden" name="token" value={token} />
          <PublicField
            label={t("name")}
            name="name"
            autoComplete="name"
            hint={t("nameHint")}
            defaultValue={state.values?.name}
            error={state.fields?.name}
          />
          <PublicField
            label={t("password")}
            name="password"
            type="password"
            autoComplete="new-password"
            hint={t("passwordHint")}
            error={state.fields?.password}
          />
          <PublicAlert error={state.error} code={state.code} />
          {needsSignIn ? (
            <Link className="text-sm underline" href={signIn}>
              {t("signInFirst")}
            </Link>
          ) : null}
          <Button type="submit" disabled={pending}>
            {t("submit")}
          </Button>
        </form>
      </CardContent>
    </>
  );
}
