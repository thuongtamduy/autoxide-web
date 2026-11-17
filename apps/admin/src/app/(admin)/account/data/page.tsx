import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { DeleteAccountDialog } from "@/components/account/delete-account";
import { Icon } from "@/components/shell/icon";
import { loadConfirmMethods } from "@/lib/confirm-server";
import { getMe } from "@/lib/viewer";

// Tab "Dữ liệu của tôi": tải về mọi dữ liệu core giữ về mình, và xoá tài khoản. Xoá cần mật khẩu
// hiện tại: tài khoản chưa có mật khẩu được chỉ sang chỗ xin thư đặt mật khẩu đầu tiên.
export default async function DataPage() {
  const t = await getTranslations("account.data");
  const me = await getMe();
  // Xác nhận bằng mật khẩu, mã hay passkey (`POST /auth/me/reauth`): tài khoản chỉ có passkey
  // cũng xoá được tài khoản của mình.
  const methods = await loadConfirmMethods();
  const canConfirm = methods.password || methods.totp || methods.passkey;
  return (
    <div className="blocks">
      <section className="block" aria-labelledby="data-h">
        <h2 id="data-h" className="h2">
          {t("title")}
        </h2>
        <div className="card list">
          <div className="item">
            <span className="sq-ic info">
              <Icon name="down" />
            </span>
            <span className="item-main">
              <span className="item-title">{t("export")}</span>
              <span className="item-meta">{t("exportMeta")}</span>
            </span>
            <span className="item-acts">
              {/* Route handler ở máy chủ gọi core bằng token trong cookie rồi trả file. */}
              <a className="btn sm pri" href="/account/export" download>
                {t("exportSubmit")}
              </a>
            </span>
          </div>
          <div className="item">
            <span className="sq-ic bad">
              <Icon name="warn" />
            </span>
            <span className="item-main">
              <span className="item-title">{t("delete")}</span>
              <span className="item-meta">
                {canConfirm ? t("deleteMeta") : t("deleteNeedsPassword")}
              </span>
            </span>
            <span className="item-acts">
              {canConfirm ? (
                <DeleteAccountDialog email={me.email} methods={methods} />
              ) : (
                <Link className="btn sm" href="/account/security">
                  {t("setPassword")}
                </Link>
              )}
            </span>
          </div>
        </div>
        <p className="note">{t("lastAdmin")}</p>
      </section>
    </div>
  );
}
