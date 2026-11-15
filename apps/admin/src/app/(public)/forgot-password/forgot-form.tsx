"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requestReset } from "../actions";
import { PublicAlert, PublicField } from "../field";

export function ForgotForm() {
  const t = useTranslations("public.forgot");
  const [state, action, pending] = useActionState(requestReset, {});
  if (state.done) {
    // Cùng một câu cho mọi email: không lộ email nào có tài khoản.
    return (
      <>
        <CardHeader>
          <CardTitle>{t("doneTitle")}</CardTitle>
          <CardDescription role="status">
            {t("done", { email: state.values?.email ?? "" })}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Link className="text-sm underline" href="/login">
            {t("back")}
          </Link>
        </CardContent>
      </>
    );
  }
  return (
    <>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={action} noValidate className="grid gap-4">
          <PublicField
            label={t("email")}
            name="email"
            type="email"
            autoComplete="username"
            defaultValue={state.values?.email}
            error={state.fields?.email}
            autoFocus
          />
          <PublicAlert error={state.error} code={state.code} />
          <Button type="submit" disabled={pending}>
            {t("submit")}
          </Button>
          <Link className="text-sm underline" href="/login">
            {t("back")}
          </Link>
        </form>
      </CardContent>
    </>
  );
}
