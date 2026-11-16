import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { VerifyForm } from "./verify-form";

// `/verify-email?token=…`: đích của link trong thư xác minh (biến
// `AUTOXIDE_AUTH_EMAIL_VERIFICATION_URL` của core). Mở trang không làm gì; người dùng bấm nút thì
// mới gửi token — để trình quét link của hộp thư (mở thử mọi link) không dùng mất token.
export default async function VerifyEmailPage(props: PageProps<"/verify-email">) {
  const t = await getTranslations("public.verify");
  const { token } = await props.searchParams;
  if (typeof token !== "string" || token === "") {
    return (
      <>
        <CardHeader>
          <CardTitle>{t("title")}</CardTitle>
          <CardDescription role="alert">{t("noToken")}</CardDescription>
        </CardHeader>
        <CardContent>
          <Link className="text-sm underline" href="/account">
            {t("toAccount")}
          </Link>
        </CardContent>
      </>
    );
  }
  return <VerifyForm token={token} />;
}
