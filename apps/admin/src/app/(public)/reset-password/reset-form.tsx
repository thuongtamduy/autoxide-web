"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { linkReason } from "@/lib/form";
import { confirmReset } from "../actions";
import { PublicAlert, PublicField } from "../field";

export function ResetForm({ token }: { token: string }) {
  const t = useTranslations("public.reset");
  const [state, action, pending] = useActionState(confirmReset, {});
  if (state.done) {
    return (
      <>
        <CardHeader>
          <CardTitle>{t("doneTitle")}</CardTitle>
          <CardDescription role="status">{t("done")}</CardDescription>
        </CardHeader>
        <CardContent>
          <Link className="text-sm underline" href="/login">
            {t("signIn")}
          </Link>
        </CardContent>
      </>
    );
  }
  // Token bị từ chối: core nói rõ hết hạn (30 phút), đã dùng hay không biết (`reason`).
  const reason = linkReason(state, "auth.invalid_reset_token");
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
            label={t("password")}
            name="password"
            type="password"
            autoComplete="new-password"
            hint={t("rule")}
            error={state.fields?.password}
            autoFocus
          />
          <PublicField
            label={t("repeat")}
            name="repeat"
            type="password"
            autoComplete="new-password"
            error={state.fields?.repeat}
          />
          <PublicAlert
            error={reason ? t(`reasons.${reason}`) : state.error}
            code={state.code}
            reason={reason ?? undefined}
          />
          {reason ? (
            <Link className="text-sm underline" href="/forgot-password">
              {t("again")}
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
