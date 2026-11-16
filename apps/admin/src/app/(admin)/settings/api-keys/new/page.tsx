import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ApiKeyCreator } from "@/components/settings/api-key-form";
import { load } from "@/lib/core";
import { myPermissions } from "@/lib/permission-catalog";
import { publicApiUrl } from "@/lib/public-url";
import { getMe } from "@/lib/viewer";

// Tạo API key: bộ chọn permission dùng chung với màn Role, chỉ bày những permission người tạo
// đang có (`GET /me/permissions`, kèm mô tả và rủi ro — không cần `auth.roles.read`). Xác nhận lại
// bằng cách tài khoản dùng được: mật khẩu, app xác thực (đã bật), passkey (đã thêm).
export default async function NewApiKeyPage() {
  const t = await getTranslations("settings.apiKeys");
  const [me, catalog, mfa, passkeys, base] = await Promise.all([
    getMe(),
    myPermissions(),
    load((client) => client.GET("/api/v1/auth/me/mfa")),
    load((client) => client.GET("/api/v1/auth/me/passkeys", { params: { query: { limit: 1 } } })),
    publicApiUrl(),
  ]);
  const methods = {
    password: me.has_password,
    totp: mfa.data.totp_enabled,
    passkey: passkeys.data.length > 0,
  };
  return (
    <div className="blocks">
      <nav className="back" aria-label={t("breadcrumb")}>
        <Link href="/settings/api-keys" className="btn ghost sm">
          <span aria-hidden="true">←</span> {t("back")}
        </Link>
      </nav>
      <section className="block" aria-labelledby="newkey-h">
        <h2 id="newkey-h" className="h2">
          {t("newTitle")}
        </h2>
        <p className="fhint">{t("newAbout")}</p>
        <ApiKeyCreator catalog={catalog} coreUrl={base.url} methods={methods} />
      </section>
    </div>
  );
}
