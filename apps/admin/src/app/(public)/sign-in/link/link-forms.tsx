"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { linkReason } from "@/lib/form";
import { confirmLoginLink, requestLoginLink } from "../../actions";
import { PublicAlert, PublicField } from "../../field";

/** Có token: nút "Đăng nhập" (bấm mới dùng token). Không có: form xin link. */
export function LinkForms({ token }: { token: string | null }) {
  return token ? <Confirm token={token} /> : <Request />;
}

function Request() {
  const t = useTranslations("public.link");
  const [state, action, pending] = useActionState(requestLoginLink, {});
  if (state.done) {
    return (
      <CardHeader>
        <CardTitle>{t("sentTitle")}</CardTitle>
        <CardDescription role="status">
          {t("sent", { email: state.values?.email ?? "" })}
        </CardDescription>
      </CardHeader>
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
            autoComplete="email"
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

function Confirm({ token }: { token: string }) {
  const t = useTranslations("public.link");
  const [state, action, pending] = useActionState(confirmLoginLink, {});
  const reason = linkReason(state, "auth.login_link_invalid");
  return (
    <>
      <CardHeader>
        <CardTitle>{t("confirmTitle")}</CardTitle>
        <CardDescription>{t("confirmDescription")}</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={action} className="grid gap-4">
          <input type="hidden" name="token" value={token} />
          <PublicAlert error={state.error} code={state.code} reason={reason ?? undefined} />
          {state.error ? (
            <Link className="text-sm underline" href="/sign-in/link">
              {t("again")}
            </Link>
          ) : null}
          <Button type="submit" disabled={pending}>
            {t("confirm")}
          </Button>
        </form>
      </CardContent>
    </>
  );
}
