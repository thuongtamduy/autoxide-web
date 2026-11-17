import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AcceptForm } from "./accept-form";

// `/invitation?token=…`: đích của link trong thư mời (biến `AUTOXIDE_AUTH_INVITATION_URL` của core).
// Người chưa có tài khoản nhận ngay ở đây; người đã có tài khoản đăng nhập rồi nhận ở
// `/account/invitation` (cần phiên đăng nhập để core cộng role vào tài khoản đó).
export default async function InvitationPage(props: PageProps<"/invitation">) {
  const t = await getTranslations("public.invitation");
  const { token } = await props.searchParams;
  if (typeof token !== "string" || token === "") {
    return (
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription role="alert">{t("noToken")}</CardDescription>
      </CardHeader>
    );
  }
  const signIn = `/login?next=${encodeURIComponent(`/account/invitation?token=${token}`)}`;
  return (
    <>
      <AcceptForm token={token} signIn={signIn} />
      <CardContent>
        <p className="text-sm text-muted-foreground">
          {t("haveAccount")}{" "}
          <Link className="underline" href={signIn}>
            {t("signInFirst")}
          </Link>
        </p>
      </CardContent>
    </>
  );
}
