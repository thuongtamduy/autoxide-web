"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { confirmEmail } from "../actions";
import { PublicAlert } from "../field";

export function VerifyForm({ token }: { token: string }) {
  const t = useTranslations("public.verify");
  const [state, action, pending] = useActionState(confirmEmail, {});
  if (state.done) {
    return (
      <>
        <CardHeader>
          <CardTitle>{t("doneTitle")}</CardTitle>
          <CardDescription role="status">
            {t("done", { email: state.values?.email ?? "" })}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Link className="text-sm underline" href="/">
            {t("continue")}
          </Link>
        </CardContent>
      </>
    );
  }
  // Token sai, đã dùng hay hết hạn: core trả chung một mã. Chỉ cách xin thư mới.
  const invalid = state.code === "auth.invalid_verification_token";
  return (
    <>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={action} className="grid gap-4">
          <input type="hidden" name="token" value={token} />
          <PublicAlert error={state.error} code={state.code} />
          {invalid ? (
            <p className="text-sm text-muted-foreground">
              {t("invalidHint")}{" "}
              <Link className="underline" href="/account">
                {t("toAccount")}
              </Link>
            </p>
          ) : null}
          <Button type="submit" disabled={pending}>
            {t("submit")}
          </Button>
        </form>
      </CardContent>
    </>
  );
}
