import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { lockAction } from "@/app/(admin)/customers/actions";
import { RegistrationForm } from "@/components/customers/forms";
import { ChangeButtons } from "@/components/engage/actions";
import { Chips } from "@/components/engage/common";
import {
  BlockHead,
  DetailRow,
  hrefWith,
  KV,
  OpenLink,
  param,
  Status,
} from "@/components/growth/blocks";
import { SampleBadge } from "@/components/sample-badge";
import { Table, Td, Th } from "@/components/ui/table";
import { Time } from "@/components/ui/time";
import { AUTH_CUSTOMERS_MANAGE, maskEmail, maskPhone } from "@/lib/customers";
import { formatCount } from "@/lib/format";
import { can } from "@/lib/viewer";
import { type AccountChip, listBuyerAccounts, registrationOpen } from "@/sample/customers";
import { CUSTOMER_TABS, ENDPOINTS_34 } from "../shared";

const CHIPS: readonly AccountChip[] = ["active", "locked", "unverified"];

// Tab "Tài khoản người mua" (bước 34, module `auth`): người mua là tài khoản riêng của khách hàng, không
// có permission; nhân viên cần `auth.customers.read` để xem, `auth.customers.manage` để khoá / mở. Khoá thu
// hồi mọi phiên của người đó; đảo được (Hoàn tác).
export default async function AccountsPage(props: PageProps<"/customers/accounts">) {
  if (!(await can(CUSTOMER_TABS.accounts))) notFound();
  const [t, locale, params] = await Promise.all([
    getTranslations("customers"),
    getLocale(),
    props.searchParams,
  ]);
  const chip = CHIPS.find((c) => c === param(params, "chip")) ?? null;
  const open = param(params, "open");
  const [all, rows, open_, manage] = await Promise.all([
    listBuyerAccounts(),
    listBuyerAccounts(chip),
    registrationOpen(),
    can(AUTH_CUSTOMERS_MANAGE),
  ]);
  const unverified = all.data.filter((a) => !a.phone_verified).length;
  const shown = rows.data.slice(0, chip ? 100 : 25);
  const base = { chip: chip ?? "" };
  return (
    <div className="blocks">
      <section className="block" aria-labelledby="accounts-h">
        <BlockHead
          id="accounts-h"
          title={t("accounts.title")}
          about={t("accounts.about")}
          actions={<SampleBadge step="34" endpoint={ENDPOINTS_34} />}
        />
        <Chips
          label={t("accounts.filter")}
          chips={[
            { href: "/customers/accounts", label: t("accounts.recent"), on: !chip },
            ...CHIPS.map((c) => ({
              href: hrefWith("/customers/accounts", {}, { chip: c }),
              label: t(`accounts.chips.${c}`),
              on: chip === c,
              count: all.data.filter((a) =>
                c === "unverified" ? !a.phone_verified : a.status === c,
              ).length,
            })),
          ]}
        />
        <div className="card tcard">
          <Table cards>
            <thead>
              <tr>
                <Th>{t("accounts.account")}</Th>
                <Th>{t("accounts.site")}</Th>
                <Th>{t("accounts.email")}</Th>
                <Th>{t("accounts.phone")}</Th>
                <Th>{t("accounts.state")}</Th>
                <Th>
                  <span className="vh">{t("accounts.actions")}</span>
                </Th>
              </tr>
            </thead>
            <tbody>
              {shown.map((a) => {
                const isOpen = open === a.id;
                return [
                  <tr key={a.id} data-current={isOpen ? "" : undefined}>
                    <Td className="rt-title">
                      <span className="cell2">
                        <OpenLink
                          open={isOpen}
                          href={hrefWith(
                            "/customers/accounts",
                            base,
                            { open: a.id },
                            "#accounts-h",
                          )}
                          closeHref={hrefWith("/customers/accounts", base, {})}
                        >
                          {a.name}
                        </OpenLink>
                        <span className="sub gr-mask">{maskEmail(a.email)}</span>
                      </span>
                    </Td>
                    <Td label={t("accounts.site")}>{a.registered_on}</Td>
                    <Td label={t("accounts.email")}>
                      {a.email_verified ? t("accounts.verified") : t("accounts.notVerified")}
                    </Td>
                    <Td label={t("accounts.phone")}>
                      {a.phone_verified ? t("accounts.verified") : t("accounts.notVerified")}
                    </Td>
                    <Td label={t("accounts.state")}>
                      <Status tone={a.status === "active" ? "b-ok" : "b-bad"}>
                        {t(`accounts.chips.${a.status}`)}
                      </Status>
                    </Td>
                    <Td className="rt-acts">
                      {manage ? (
                        <ChangeButtons
                          action={lockAction}
                          id={a.id}
                          expect={a.updated_at}
                          moves={
                            a.status === "active"
                              ? [
                                  {
                                    value: "locked",
                                    label: t("accounts.lock"),
                                    done: t("accounts.locked"),
                                    tone: "danger",
                                  },
                                ]
                              : [
                                  {
                                    value: "active",
                                    label: t("accounts.unlock"),
                                    done: t("accounts.unlocked"),
                                    tone: "pri",
                                  },
                                ]
                          }
                          undo={{ label: t("undo"), done: t("undone") }}
                        />
                      ) : null}
                    </Td>
                  </tr>,
                  isOpen ? (
                    <DetailRow key={`${a.id}-open`} cols={6}>
                      <h3 className="h2">{a.name}</h3>
                      <KV
                        items={[
                          [t("accounts.registered"), <Time key="r" value={a.registered_at} date />],
                          [
                            t("accounts.lastLogin"),
                            a.last_login_at ? <Time key="l" value={a.last_login_at} /> : "—",
                          ],
                          [
                            t("accounts.phone"),
                            <span key="p" className="gr-mask">
                              {maskPhone(a.phone)}
                            </span>,
                          ],
                          [
                            t("accounts.phoneVerify"),
                            a.phone_verified
                              ? t("accounts.verified")
                              : t("accounts.notVerifiedEffect"),
                          ],
                          a.locked_by ? [t("accounts.lockedBy"), a.locked_by.name] : null,
                          a.locked_at
                            ? [t("accounts.lockedAt"), <Time key="la" value={a.locked_at} />]
                            : null,
                          a.lock_reason ? [t("accounts.lockReason"), a.lock_reason] : null,
                        ]}
                      />
                      <p className="fhint">{t("accounts.noPassword")}</p>
                    </DetailRow>
                  ) : null,
                ];
              })}
            </tbody>
          </Table>
        </div>
        <p className="fhint">
          {t("accounts.shown", { shown: shown.length, total: rows.data.length })}
        </p>
      </section>
      <section className="block half" aria-labelledby="signup-h">
        <BlockHead id="signup-h" title={t("accounts.signupTitle")} />
        {manage ? (
          <RegistrationForm open={open_} />
        ) : (
          <p className="note">{open_ ? t("accounts.signupOn") : t("accounts.signupOff")}</p>
        )}
      </section>
      <section className="block half" aria-label={t("accounts.unverifiedTitle")}>
        <p className="note warn">
          <b>{t("accounts.unverifiedCount", { n: formatCount(unverified, locale) })}</b>{" "}
          {t("accounts.unverifiedText")}
        </p>
      </section>
    </div>
  );
}
