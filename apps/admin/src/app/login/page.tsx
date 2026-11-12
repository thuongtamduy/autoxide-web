import { cookies } from "next/headers";
import { getTranslations } from "next-intl/server";
import { LanguageSwitch } from "@/components/language-switch";
import { Card } from "@/components/ui/card";
import { MFA_COOKIE, safeNext } from "@/lib/session";
import { LoginForm } from "./login-form";

export default async function LoginPage(props: PageProps<"/login">) {
  const app = await getTranslations("app");
  const { next } = await props.searchParams;
  // Đang dở bước nhập mã (vd tải lại trang): mở thẳng bước đó.
  const step = (await cookies()).has(MFA_COOKIE) ? "mfa" : "password";
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 px-4">
      <p className="text-sm font-semibold tracking-wide text-muted-foreground">
        {app("name")} · {app("admin")}
      </p>
      <Card className="w-full max-w-sm">
        <LoginForm next={safeNext(next)} initialStep={step} />
      </Card>
      <LanguageSwitch />
    </main>
  );
}
