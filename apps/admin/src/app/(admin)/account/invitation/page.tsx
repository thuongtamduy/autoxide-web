import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { AcceptMine } from "@/components/account/accept-invitation";
import { getMe } from "@/lib/viewer";

// `/account/invitation?token=…`: nhận lời mời bằng tài khoản đang đăng nhập (core cộng role của lời
// mời vào tài khoản này). Trang công khai `/invitation` dẫn tới đây qua bước đăng nhập. Bấm nút mới
// dùng token.
export default async function AcceptInvitationPage(props: PageProps<"/account/invitation">) {
  const t = await getTranslations("account.invitation");
  const { token } = await props.searchParams;
  const me = await getMe();
  return (
    <div className="blocks">
      <section className="block half" aria-labelledby="inv-h">
        <h2 id="inv-h" className="h2">
          {t("title")}
        </h2>
        {typeof token === "string" && token !== "" ? (
          <AcceptMine token={token} email={me.email} />
        ) : (
          <p className="note warn" role="alert">
            {t("noToken")} <Link href="/">{t("home")}</Link>
          </p>
        )}
      </section>
    </div>
  );
}
