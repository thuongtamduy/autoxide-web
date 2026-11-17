"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useActionState, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { useHydrated } from "@/lib/hydrated";
import { ceremonyErrorKey, passkeySignInSupported, requestOptionsJson } from "@/lib/webauthn";
import { finishPasskeyLogin, type LoginState, startPasskeyLogin, submitLogin } from "./actions";

/**
 * Form đăng nhập hai bước. Action là server action trần nên form vẫn gửi được khi trình
 * duyệt chưa chạy JavaScript.
 */
export function LoginForm({
  next,
  initialStep,
  workspace,
}: {
  next: string;
  initialStep: LoginState["step"];
  /** Khách đã chọn lần trước (cookie); có thì hiện sẵn ô "Không gian làm việc". */
  workspace?: string | undefined;
}) {
  const t = useTranslations("login");
  const [state, action, pending] = useActionState(submitLogin, {
    step: initialStep,
    ...(workspace ? { askWorkspace: true, workspace } : {}),
  });
  const mfa = state.step === "mfa";
  const hydrated = useHydrated();
  // Đăng nhập bằng passkey (thiết kế "Đăng nhập"): không cần email, passkey tự nhận ra tài khoản.
  // Lỗi của nó hiện thay lỗi của form; core nhiều khách chưa biết khách thì hiện ô "Không gian làm việc".
  const [passkey, setPasskey] = useState<{ error: string; code: string } | null>(null);
  const [passkeyAsk, setPasskeyAsk] = useState(false);
  const [signing, startSigning] = useTransition();
  const askWorkspace = state.askWorkspace || passkeyAsk;
  const shown = passkey ?? (state.error ? { error: state.error, code: state.code } : null);
  const signInWithPasskey = () => {
    setPasskey(null);
    if (!passkeySignInSupported()) {
      setPasskey({ error: t("passkeyUnsupported"), code: "login.webauthn_unsupported" });
      return;
    }
    const typed = document.getElementById("workspace");
    const workspace = typed instanceof HTMLInputElement ? typed.value : null;
    startSigning(async () => {
      const started = await startPasskeyLogin(workspace);
      if (started.askWorkspace) setPasskeyAsk(true);
      if (started.options === undefined) {
        setPasskey({ error: started.error ?? t("passkeyFailed"), code: started.code ?? "" });
        return;
      }
      let credential: unknown;
      try {
        const publicKey = PublicKeyCredential.parseRequestOptionsFromJSON(
          requestOptionsJson(started.options),
        );
        const signed = await navigator.credentials.get({ publicKey });
        if (!(signed instanceof PublicKeyCredential)) throw new Error("no credential");
        credential = signed.toJSON();
      } catch (error) {
        const why = ceremonyErrorKey(error) === "cancelled" ? "cancelled" : "failed";
        setPasskey({
          error: t(why === "cancelled" ? "passkeyCancelled" : "passkeyFailed"),
          code: `login.webauthn_${why}`,
        });
        return;
      }
      // Thành công thì máy chủ chuyển trang (`redirect`); chỉ quay lại đây khi core từ chối.
      setPasskey(await finishPasskeyLogin(credential, next));
    });
  };
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
                  autoFocus={Boolean(state.email) && !askWorkspace}
                />
              </div>
              {askWorkspace ? (
                <div className="grid gap-1.5">
                  <Label htmlFor="workspace">{t("workspace")}</Label>
                  <Input
                    id="workspace"
                    name="workspace"
                    autoComplete="organization"
                    autoCapitalize="none"
                    spellCheck={false}
                    defaultValue={state.workspace}
                    aria-describedby="workspace-hint"
                    autoFocus={Boolean(state.email)}
                  />
                  <p id="workspace-hint" className="text-xs text-muted-foreground">
                    {t("workspaceHint")}
                  </p>
                </div>
              ) : null}
            </>
          )}
          {shown && (
            <p role="alert" data-code={shown.code} className="text-sm text-danger">
              {shown.error}
            </p>
          )}
          <Button type="submit" name="intent" value={mfa ? "code" : "password"} disabled={pending}>
            {mfa ? t("verify") : t("submit")}
          </Button>
          {mfa ? null : (
            <Button
              type="button"
              variant="outline"
              onClick={signInWithPasskey}
              disabled={!hydrated || pending || signing}
            >
              {t("passkey")}
            </Button>
          )}
          {mfa ? null : (
            <Link className="text-sm underline" href="/forgot-password">
              {t("forgot")}
            </Link>
          )}
          {mfa ? null : (
            <Link className="text-sm underline" href="/sign-in/link">
              {t("linkSignIn")}
            </Link>
          )}
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
