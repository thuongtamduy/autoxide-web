import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { NotMeForm } from "./not-me-form";

// `/not-me?token=…`: đích của link trong thư báo đổi email gửi tới địa chỉ cũ (biến
// `AUTOXIDE_AUTH_EMAIL_CHANGE_REPORT_URL` của core). Mở trang không làm gì; người dùng bấm nút thì mới
// gửi báo — để trình quét link của hộp thư (mở thử mọi link) không khoá nhầm tài khoản.
export default async function NotMePage(props: PageProps<"/not-me">) {
  const t = await getTranslations("public.notMe");
  const { token } = await props.searchParams;
  if (typeof token !== "string" || token === "") {
    return (
      <>
        <CardHeader>
          <CardTitle>{t("title")}</CardTitle>
          <CardDescription role="alert">{t("noToken")}</CardDescription>
        </CardHeader>
        <CardContent>
          <Link className="text-sm underline" href="/login">
            {t("toLogin")}
          </Link>
        </CardContent>
      </>
    );
  }
  return <NotMeForm token={token} />;
}
