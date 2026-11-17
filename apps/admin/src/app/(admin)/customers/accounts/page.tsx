import type { components } from "@autoxide/sdk";
import Form from "next/form";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import {
  bulkLockBuyers,
  bulkUnlockBuyers,
  changeBuyer,
  setBuyerDisabled,
} from "@/app/(admin)/customers/account-actions";
import { RegistrationForm } from "@/components/customers/forms";
import { Chips } from "@/components/engage/common";
import { BlockHead, hrefWith, param, Status } from "@/components/growth/blocks";
import { type BulkActionSpec, BulkTable, SelectAllTh, SelectTd } from "@/components/ui/bulk";
import { ConfirmAction } from "@/components/ui/confirm";
import { Pager } from "@/components/ui/pager";
import { RowMenu, type RowMenuItem } from "@/components/ui/row-menu";
import { SortTh } from "@/components/ui/sort-th";
import { Table, Td, Th } from "@/components/ui/table";
import { Time } from "@/components/ui/time";
import { isForbidden, load } from "@/lib/core";
import { AUTH_CUSTOMERS_MANAGE } from "@/lib/customers";
import { rootUnit } from "@/lib/org-server";
import { readSort } from "@/lib/table";
import { can } from "@/lib/viewer";
import { CUSTOMER_TABS } from "../shared";

const CHIPS = ["active", "disabled"] as const;
const BASE = "/customers/accounts";
type Buyer = components["schemas"]["CustomerResponse"];

// Tab "Tài khoản người mua" (`/auth/customers`, bước 34 của core): người mua là tài khoản riêng của
// khách hàng, không có permission (D-309). Nhân viên cần `auth.customers.read` để xem,
// `auth.customers.manage` để khoá / mở; khoá thì người mua bị đăng xuất mọi nơi. Tìm theo email hay
// tên (không dấu vẫn ra). Bật / tắt tự đăng ký là cài đặt `auth.customer_registration` ở nút gốc.
// Bộ bảng (W-058): chọn nhiều để khoá / mở (lặp lệnh từng cái của core), "⋯" trên dòng (khoá hỏi lại,
// mở có Hoàn tác), sắp theo ngày đăng ký bằng `order` của core, phân trang theo con trỏ (không có tổng).
export default async function AccountsPage(props: PageProps<"/customers/accounts">) {
  if (!(await can(CUSTOMER_TABS.accounts))) notFound();
  const [t, tt, params] = await Promise.all([
    getTranslations("customers"),
    getTranslations("table"),
    props.searchParams,
  ]);
  const status = CHIPS.find((c) => c === param(params, "status")) ?? null;
  const q = (param(params, "q") ?? "").trim();
  const cursor = param(params, "cursor") || undefined;
  // Core chỉ sắp theo thời gian tạo (`order`), nên chỉ cột "Đăng ký" sắp được.
  const sort = readSort(params, ["registered"], { field: "registered", dir: "desc" });
  const order = param(params, "sort") ? sort.dir : undefined;
  let page: components["schemas"]["Page_CustomerResponse"];
  try {
    page = await load((c) =>
      c.GET("/api/v1/auth/customers", {
        params: {
          query: {
            limit: 50,
            ...(q ? { q } : {}),
            ...(status ? { status } : {}),
            ...(order ? { order } : {}),
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
  const keep = { q, status: status ?? "", ...(order ? { sort: "registered", dir: order } : {}) };
  const next = page.pagination.next_cursor;
  const bulk: BulkActionSpec[] = manage
    ? [
        {
          key: "lock",
          label: t("accounts.lock"),
          tone: "danger",
          run: bulkLockBuyers,
          confirm: {
            title: t("accounts.bulkLockTitle"),
            points: [t("accounts.bulkLockSessions"), t("accounts.bulkLockUndo")],
            submit: t("accounts.lock"),
          },
        },
        { key: "unlock", label: t("accounts.unlock"), run: bulkUnlockBuyers },
      ]
    : [];
  // "⋯" của một dòng: khoá (hỏi lại, người mua bị đăng xuất mọi nơi) hay mở (có Hoàn tác).
  const menu = (a: Buyer): RowMenuItem[] => [
    a.disabled_at
      ? {
          label: t("accounts.unlock"),
          change: {
            action: changeBuyer,
            id: a.id,
            expect: a.updated_at,
            value: "active",
            done: t("accounts.unlocked"),
            undo: { label: t("undo"), done: t("undone") },
          },
        }
      : {
          label: t("accounts.lock"),
          danger: true,
          dialog: (
            <ConfirmAction
              action={setBuyerDisabled}
              id={`${a.id}|lock`}
              label={t("accounts.lock")}
              title={t("accounts.lockTitle", { name: a.name })}
              points={[t("accounts.lockSignsOut"), t("accounts.lockUndo")]}
              submit={t("accounts.lock")}
              done={t("accounts.locked")}
            />
          ),
        },
  ];
  return (
    <div className="blocks">
      <section className="block" aria-labelledby="accounts-h">
        <BlockHead id="accounts-h" title={t("accounts.title")} about={t("accounts.aboutCore")} />
        <Chips
          label={t("accounts.filter")}
          chips={[
            {
              href: hrefWith(BASE, { q }, {}),
              label: t("accounts.all"),
              on: !status,
            },
            ...CHIPS.map((c) => ({
              href: hrefWith(BASE, { q }, { status: c }),
              label: t(`accounts.chips.${c}`),
              on: status === c,
            })),
          ]}
        />
        <Form action={BASE} className="pf-filters" role="search">
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
          <BulkTable ids={page.data.map((a) => a.id)} actions={bulk}>
            <Table cards>
              <thead>
                <tr>
                  {manage ? <SelectAllTh /> : null}
                  <Th>{t("accounts.account")}</Th>
                  <Th>{t("accounts.email")}</Th>
                  <SortTh field="registered" sort={sort} base={BASE} keep={keep} first="desc">
                    {t("accounts.registered")}
                  </SortTh>
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
                    {manage ? <SelectTd id={a.id} name={a.name} /> : null}
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
                        <RowMenu label={tt("moreFor", { name: a.name })} items={menu(a)} />
                      </Td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </Table>
          </BulkTable>
          {page.data.length === 0 ? <p className="empty">{t("accounts.none")}</p> : null}
        </div>
        <Pager
          first={cursor ? hrefWith(BASE, keep, {}) : null}
          next={next ? hrefWith(BASE, keep, { cursor: next }) : null}
        />
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
