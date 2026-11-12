"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { type LoginState, submitLogin } from "./actions";

/**
 * Form đăng nhập hai bước. Action là server action trần nên form vẫn gửi được khi trình
 * duyệt chưa chạy JavaScript.
 */
export function LoginForm({
  next,
  initialStep,
}: {
  next: string;
  initialStep: LoginState["step"];
}) {
  const t = useTranslations("login");
  const [state, action, pending] = useActionState(submitLogin, { step: initialStep });
  const mfa = state.step === "mfa";
  return (
    <>
      <CardHeader>
        <CardTitle>{mfa ? t("mfaTitle") : t("title")}</CardTitle>
        <CardDescription>{mfa ? t("mfaDescription") : t("description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={action} className="grid gap-4">
          <input type="hidden" name="next" value={next} />
          {mfa ? (
            <div className="grid gap-1.5">
              <Label htmlFor="code">{t("code")}</Label>
              <Input
                key="code"
                id="code"
                name="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                required
                autoFocus
              />
            </div>
          ) : (
            <>
              <div className="grid gap-1.5">
                <Label htmlFor="email">{t("email")}</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="username"
                  defaultValue={state.email}
                  required
                  autoFocus={!state.email}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="password">{t("password")}</Label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  autoFocus={Boolean(state.email)}
                />
              </div>
            </>
          )}
          {state.error && (
            <p role="alert" data-code={state.code} className="text-sm text-danger">
              {state.error}
            </p>
          )}
          <Button type="submit" name="intent" value={mfa ? "code" : "password"} disabled={pending}>
            {mfa ? t("verify") : t("submit")}
          </Button>
          {mfa && (
            <Button
              type="submit"
              name="intent"
              value="restart"
              variant="ghost"
              formNoValidate
              disabled={pending}
            >
              {t("restart")}
            </Button>
          )}
        </form>
      </CardContent>
    </>
  );
}
