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
import { Icon } from "@/components/shell/icon";
import { AutoFilter } from "@/components/ui/auto-filter";
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
// hồi mọi phiên của người đó; đảo được (Hoàn tác). Bấm một dòng mở chi tiết; nút khoá chỉ hiện khi rê
// chuột lên dòng (máy có chuột), vì 25 nút giống nhau làm rối bảng.
export default async function AccountsPage(props: PageProps<"/customers/accounts">) {
  if (!(await can(CUSTOMER_TABS.accounts))) notFound();
  const [t, locale, params] = await Promise.all([
    getTranslations("customers"),
    getLocale(),
    props.searchParams,
  ]);
  const chip = CHIPS.find((c) => c === param(params, "chip")) ?? null;
  const open = param(params, "open");
  const q = param(params, "q").slice(0, 60);
  const [all, rows, open_, manage] = await Promise.all([
    listBuyerAccounts(),
    listBuyerAccounts(chip, q),
    registrationOpen(),
    can(AUTH_CUSTOMERS_MANAGE),
  ]);
  const unverified = all.data.filter((a) => !a.phone_verified).length;
  const shown = rows.data.slice(0, chip || q ? 100 : 25);
  const base = { q, chip: chip ?? "" };
  return (
    <div className="blocks">
      <section className="block" aria-labelledby="accounts-h">
        <BlockHead
          id="accounts-h"
          title={t("accounts.title")}
          about={t("accounts.about")}
          actions={<SampleBadge step="34" endpoint={ENDPOINTS_34} />}
        />
        <form className="filters" action="/customers/accounts">
          <AutoFilter />
          <div className="fld grow">
            <label className="lab" htmlFor="accounts-q">
              {t("accounts.search")}
            </label>
            <input
              id="accounts-q"
              className="inp"
              type="search"
              name="q"
              defaultValue={q}
              placeholder={t("accounts.searchHint")}
            />
          </div>
          {chip ? <input type="hidden" name="chip" value={chip} /> : null}
          <div className="filters-acts">
            <button type="submit" className="btn">
              {t("accounts.find")}
            </button>
          </div>
        </form>
        <Chips
          label={t("accounts.filter")}
          chips={[
            {
              href: hrefWith("/customers/accounts", { q }, {}),
              label: t("accounts.recent"),
              on: !chip,
            },
            ...CHIPS.map((c) => ({
              href: hrefWith("/customers/accounts", { q }, { chip: c }),
              label: t(`accounts.chips.${c}`),
              on: chip === c,
              count: all.data.filter((a) =>
                c === "unverified" ? !a.phone_verified : a.status === c,
              ).length,
            })),
          ]}
        />
        <div className="card tcard">
          <Table cards className="cu-accounts">
            <thead>
              <tr>
                <Th>{t("accounts.account")}</Th>
                <Th>{t("accounts.site")}</Th>
                <Th>{t("accounts.verification")}</Th>
                <Th>{t("accounts.lastLogin")}</Th>
                <Th>{t("accounts.state")}</Th>
                <Th>
                  <span className="vh">{t("accounts.actions")}</span>
                </Th>
              </tr>
            </thead>
            <tbody>
              {shown.length === 0 ? (
                <tr>
                  <Td colSpan={6} className="empty">
                    {q ? t("accounts.emptySearch", { q }) : t("accounts.empty")}
                  </Td>
                </tr>
              ) : null}
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
                    <Td label={t("accounts.verification")}>
                      <span className="cu-verify">
                        <Verified
                          on={a.email_verified}
                          icon="mail"
                          label={
                            a.email_verified
                              ? t("accounts.emailVerified")
                              : t("accounts.emailNotVerified")
                          }
                        />
                        <Verified
                          on={a.phone_verified}
                          icon="phone"
                          label={
                            a.phone_verified
                              ? t("accounts.phoneVerified")
                              : t("accounts.phoneNotVerified")
                          }
                        />
                      </span>
                    </Td>
                    <Td label={t("accounts.lastLogin")}>
                      {a.last_login_at ? <Time value={a.last_login_at} /> : "—"}
                    </Td>
                    <Td label={t("accounts.state")}>
                      <Status tone={a.status === "active" ? "b-ok" : "b-bad"}>
                        {t(`accounts.chips.${a.status}`)}
                      </Status>
                    </Td>
                    <Td className="rt-acts">
                      {manage ? (
                        <span className={a.status === "active" ? "cu-reveal" : undefined}>
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
                        </span>
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
                            t("accounts.email"),
                            <span key="e" className="gr-mask">
                              {maskEmail(a.email)}
                            </span>,
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
        <div className="cu-foot">
          <p className="fhint">
            {t("accounts.shown", { shown: shown.length, total: rows.data.length })}
          </p>
          {unverified > 0 ? (
            <p className="fhint">
              {t("accounts.unverifiedCount", { n: formatCount(unverified, locale) })}{" "}
              {t("accounts.unverifiedText")}
            </p>
          ) : null}
        </div>
      </section>
      <section className="block" aria-labelledby="signup-h">
        <BlockHead id="signup-h" title={t("accounts.signupTitle")} />
        {manage ? (
          <RegistrationForm open={open_} />
        ) : (
          <p className="note">{open_ ? t("accounts.signupOn") : t("accounts.signupOff")}</p>
        )}
      </section>
    </div>
  );
}

/** Biểu tượng xác thực (email hoặc SĐT): xanh khi đã xác thực; chữ đầy đủ ở `title` và cho máy đọc. */
function Verified({ on, icon, label }: { on: boolean; icon: "mail" | "phone"; label: string }) {
  return (
    <span className={on ? "cu-vf on" : "cu-vf"} title={label} role="img" aria-label={label}>
      <Icon name={icon} small />
    </span>
  );
}
