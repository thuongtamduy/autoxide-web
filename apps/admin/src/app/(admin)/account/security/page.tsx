import { getTranslations } from "next-intl/server";
import { AddPasskeyDialog, RemovePasskeyDialog } from "@/components/account/passkeys";
import { PasswordDialog } from "@/components/account/password-dialog";
import { TotpActions } from "@/components/account/totp";
import { Icon } from "@/components/shell/icon";
import { Table, Td, Th } from "@/components/ui/table";
import { Time } from "@/components/ui/time";
import { load } from "@/lib/core";

// Tab "Đăng nhập và bảo mật": mật khẩu, xác thực hai bước (app xác thực, mã khôi phục), passkey.
export default async function SecurityPage() {
  const t = await getTranslations("account");
  const [mfa, passkeys] = await Promise.all([
    load((client) => client.GET("/api/v1/auth/me/mfa")),
    load((client) => client.GET("/api/v1/auth/me/passkeys", { params: { query: { limit: 200 } } })),
  ]);
  const { totp_enabled: totp, recovery_codes_remaining: remaining } = mfa.data;
  return (
    <div className="blocks">
      <section className="block" aria-labelledby="ways-h">
        <h2 id="ways-h" className="h2">
          {t("security.title")}
        </h2>
        <div className="card list">
          <div className="item">
            <span className="sq-ic">
              <Icon name="key" />
            </span>
            <span className="item-main">
              <span className="item-title">{t("password.title")}</span>
              <span className="item-meta">{t("password.meta")}</span>
            </span>
            <span className="item-acts">
              <PasswordDialog />
            </span>
          </div>
          <div className="item" data-testid="totp">
            <span className={totp ? "sq-ic ok" : "sq-ic"}>
              <Icon name="shield" />
            </span>
            <span className="item-main">
              <span className="item-title">{t("totp.title")}</span>
              <span className="item-meta">
                {totp ? t("totp.onMeta", { remaining }) : t("totp.offMeta")}
              </span>
            </span>
            <span className={totp ? "badge b-ok" : "badge b-draft"}>
              <span className="dot" />
              {totp ? t("totp.on") : t("totp.off")}
            </span>
            <span className="item-acts">
              <TotpActions enabled={totp} />
            </span>
          </div>
        </div>
        {totp && remaining <= 3 ? (
          <p className="note warn" role="status">
            {t("totp.lowCodes", { remaining })}
          </p>
        ) : null}
      </section>

      <section className="block" aria-labelledby="passkeys-h">
        <div className="block-head">
          <h2 id="passkeys-h" className="h2">
            {t("passkeys.title")}
          </h2>
          <AddPasskeyDialog />
        </div>
        <p className="fhint">{t("passkeys.about")}</p>
        <div className="card tcard">
          {passkeys.data.length === 0 ? (
            <p className="empty">{t("passkeys.empty")}</p>
          ) : (
            <Table cards>
              <thead>
                <tr>
                  <Th>{t("passkeys.name")}</Th>
                  <Th>{t("passkeys.addedOn")}</Th>
                  <Th>{t("passkeys.lastUsed")}</Th>
                  <Th>
                    <span className="vh">{t("passkeys.actions")}</span>
                  </Th>
                </tr>
              </thead>
              <tbody>
                {passkeys.data.map((passkey) => (
                  <tr key={passkey.id}>
                    <Td className="rt-title">
                      <b>{passkey.name}</b>
                    </Td>
                    <Td className="whitespace-nowrap" label={t("passkeys.addedOn")}>
                      <Time value={passkey.created_at} />
                    </Td>
                    <Td className="whitespace-nowrap" label={t("passkeys.lastUsed")}>
                      {passkey.last_used_at ? (
                        <Time value={passkey.last_used_at} />
                      ) : (
                        t("passkeys.never")
                      )}
                    </Td>
                    <Td className="rt-acts">
                      <RemovePasskeyDialog id={passkey.id} name={passkey.name} />
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </div>
      </section>
    </div>
  );
}
