import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ResetForm } from "./reset-form";

// `/reset-password?token=…`: đích của link trong thư đặt lại mật khẩu (biến
// `AUTOXIDE_AUTH_PASSWORD_RESET_URL` của core).
export default async function ResetPasswordPage(props: PageProps<"/reset-password">) {
  const t = await getTranslations("public.reset");
  const { token } = await props.searchParams;
  if (typeof token !== "string" || token === "") {
    return (
      <>
        <CardHeader>
          <CardTitle>{t("title")}</CardTitle>
          <CardDescription role="alert">{t("noToken")}</CardDescription>
        </CardHeader>
        <CardContent>
          <Link className="text-sm underline" href="/forgot-password">
            {t("again")}
          </Link>
        </CardContent>
      </>
    );
  }
  return <ResetForm token={token} />;
}
