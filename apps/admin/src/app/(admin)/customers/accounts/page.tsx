import type { components } from "@autoxide/sdk";
import Form from "next/form";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { setBuyerDisabled } from "@/app/(admin)/customers/account-actions";
import { RegistrationForm } from "@/components/customers/forms";
import { Chips } from "@/components/engage/common";
import { BlockHead, hrefWith, param, Status } from "@/components/growth/blocks";
import { ConfirmAction, InlineAction } from "@/components/ui/confirm";
import { Table, Td, Th } from "@/components/ui/table";
import { Time } from "@/components/ui/time";
import { isForbidden, load } from "@/lib/core";
import { AUTH_CUSTOMERS_MANAGE } from "@/lib/customers";
import { rootUnit } from "@/lib/org-server";
import { can } from "@/lib/viewer";
import { CUSTOMER_TABS } from "../shared";

const CHIPS = ["active", "disabled"] as const;

// Tab "Tài khoản người mua" (`/auth/customers`, bước 34 của core): người mua là tài khoản riêng của
// khách hàng, không có permission (D-309). Nhân viên cần `auth.customers.read` để xem,
// `auth.customers.manage` để khoá / mở; khoá thì người mua bị đăng xuất mọi nơi. Tìm theo email hay
// tên (không dấu vẫn ra). Bật / tắt tự đăng ký là cài đặt `auth.customer_registration` ở nút gốc.
export default async function AccountsPage(props: PageProps<"/customers/accounts">) {
  if (!(await can(CUSTOMER_TABS.accounts))) notFound();
  const [t, params] = await Promise.all([getTranslations("customers"), props.searchParams]);
  const status = CHIPS.find((c) => c === param(params, "status")) ?? null;
  const q = (param(params, "q") ?? "").trim();
  const cursor = param(params, "cursor") ?? undefined;
  let page: components["schemas"]["Page_CustomerResponse"];
  try {
    page = await load((c) =>
      c.GET("/api/v1/auth/customers", {
        params: {
          query: {
            limit: 50,
            ...(q ? { q } : {}),
            ...(status ? { status } : {}),
            ...(cursor ? { cursor } : {}),
          },
        },
      }),
    );
  } catch (error) {
    if (isForbidden(error)) notFound();
    throw error;
  }
  const [manage, open] = await Promise.all([can(AUTH_CUSTOMERS_MANAGE), registrationOpen()]);
  const base = { q, status: status ?? "" };
  const next = page.pagination.next_cursor;
  return (
    <div className="blocks">
      <section className="block" aria-labelledby="accounts-h">
        <BlockHead id="accounts-h" title={t("accounts.title")} about={t("accounts.aboutCore")} />
        <Chips
          label={t("accounts.filter")}
          chips={[
            {
              href: hrefWith("/customers/accounts", { q }, {}),
              label: t("accounts.all"),
              on: !status,
            },
            ...CHIPS.map((c) => ({
              href: hrefWith("/customers/accounts", { q }, { status: c }),
              label: t(`accounts.chips.${c}`),
              on: status === c,
            })),
          ]}
        />
        <Form action="/customers/accounts" className="pf-filters" role="search">
          {status ? <input type="hidden" name="status" value={status} /> : null}
          <label>
            <span className="vh">{t("accounts.search")}</span>
            <input
              className="inp"
              type="search"
              name="q"
              defaultValue={q}
              placeholder={t("accounts.search")}
            />
          </label>
          <button type="submit" className="btn">
            {t("accounts.find")}
          </button>
        </Form>
        <div className="card tcard" data-testid="buyer-accounts">
          <Table cards>
            <thead>
              <tr>
                <Th>{t("accounts.account")}</Th>
                <Th>{t("accounts.email")}</Th>
                <Th>{t("accounts.registered")}</Th>
                <Th>{t("accounts.state")}</Th>
                {manage ? (
                  <Th>
                    <span className="vh">{t("accounts.actions")}</span>
                  </Th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {page.data.map((a) => (
                <tr key={a.id}>
                  <Td className="rt-title">
                    <span className="cell2">
                      <b>{a.name}</b>
                      <span className="sub mono">{a.email}</span>
                    </span>
                  </Td>
                  <Td label={t("accounts.email")}>
                    {a.email_verified_at ? t("accounts.verified") : t("accounts.notVerified")}
                  </Td>
                  <Td label={t("accounts.registered")}>
                    <Time value={a.created_at} date />
                  </Td>
                  <Td label={t("accounts.state")}>
                    <Status tone={a.disabled_at ? "b-bad" : "b-ok"}>
                      {t(`accounts.chips.${a.disabled_at ? "disabled" : "active"}`)}
                    </Status>
                  </Td>
                  {manage ? (
                    <Td className="rt-acts">
                      {a.disabled_at ? (
                        <InlineAction
                          action={setBuyerDisabled}
                          id={`${a.id}|unlock`}
                          label={t("accounts.unlock")}
                          done={t("accounts.unlocked")}
                        />
                      ) : (
                        <ConfirmAction
                          action={setBuyerDisabled}
                          id={`${a.id}|lock`}
                          label={t("accounts.lock")}
                          title={t("accounts.lockTitle", { name: a.name })}
                          points={[t("accounts.lockSignsOut"), t("accounts.lockUndo")]}
                          submit={t("accounts.lock")}
                          done={t("accounts.locked")}
                        />
                      )}
                    </Td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </Table>
          {page.data.length === 0 ? <p className="empty">{t("accounts.none")}</p> : null}
        </div>
        {cursor || next ? (
          <nav className="pager" aria-label={t("accounts.pages")}>
            {cursor ? (
              <Link className="btn sm" href={hrefWith("/customers/accounts", base, {})}>
                {t("accounts.first")}
              </Link>
            ) : null}
            {next ? (
              <Link
                className="btn sm"
                href={hrefWith("/customers/accounts", base, { cursor: next })}
              >
                {t("accounts.next")}
              </Link>
            ) : null}
          </nav>
        ) : null}
      </section>
      <section className="block half" aria-labelledby="signup-h">
        <BlockHead id="signup-h" title={t("accounts.signupTitle")} />
        {manage ? (
          <RegistrationForm open={open} />
        ) : (
          <p className="note">{open ? t("accounts.signupOn") : t("accounts.signupOff")}</p>
        )}
      </section>
    </div>
  );
}

/** Người mua tự đăng ký được không (`auth.customer_registration` ở nút gốc; mặc định bật). */
async function registrationOpen(): Promise<boolean> {
  const root = await rootUnit();
  if (!root) return true;
  try {
    const settings = (
      await load((c) =>
        c.GET("/api/v1/organizations/units/{id}/settings", { params: { path: { id: root.id } } }),
      )
    ).data;
    return settings.find((s) => s.key === "auth.customer_registration")?.value !== false;
  } catch (error) {
    if (isForbidden(error)) return true;
    throw error;
  }
}
