import { cookies } from "next/headers";
import { getTranslations } from "next-intl/server";
import { LanguageSwitch } from "@/components/language-switch";
import { Card } from "@/components/ui/card";
import { getClientConfig } from "@/lib/client-config";
import { adminTenantSetting, secureCookies } from "@/lib/env";
import { MFA_COOKIE, safeNext } from "@/lib/session";
import { TENANT_COOKIE } from "@/lib/tenant";
import { InsecureOriginWarning } from "./insecure-warning";
import { LoginForm } from "./login-form";

export default async function LoginPage(props: PageProps<"/login">) {
  const app = await getTranslations("app");
  const t = await getTranslations("login");
  const { next, deleted } = await props.searchParams;
  // Đang dở bước nhập mã (vd tải lại trang): mở thẳng bước đó.
  const store = await cookies();
  const step = store.has(MFA_COOKIE) ? "mfa" : "password";
  // Khách đã chọn lần trước: hiện sẵn ô. Trang quản trị dành riêng một khách thì không bao giờ hỏi.
  const workspace = adminTenantSetting() ? undefined : store.get(TENANT_COOKIE)?.value;
  // Cách đăng nhập máy chủ bật (`auth` của client-config, D-333 của core); không đọc được thì hiện cả.
  const auth = (await getClientConfig())?.auth;
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 px-4">
      <p className="text-sm font-semibold tracking-wide text-muted-foreground">
        {app("name")} · {app("admin")}
      </p>
      <InsecureOriginWarning secure={secureCookies()} />
      {deleted ? (
        <p role="status" className="w-full max-w-sm text-sm text-muted-foreground">
          {t("deleted")}
        </p>
      ) : null}
      <Card className="w-full max-w-sm">
        <LoginForm
          next={safeNext(next)}
          initialStep={step}
          workspace={workspace}
          passkeys={auth?.passkeys !== false}
          loginLink={auth?.login_link !== false}
        />
      </Card>
      <LanguageSwitch />
    </main>
  );
}
