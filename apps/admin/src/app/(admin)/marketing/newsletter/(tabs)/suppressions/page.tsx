import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { removeSuppression } from "@/app/(admin)/marketing/newsletter/actions";
import { ConfirmButton } from "@/components/engage/actions";
import { Forbidden, Pager } from "@/components/engage/common";
import { SuppressDialog } from "@/components/engage/subscriber-forms";
import { AutoFilter } from "@/components/ui/auto-filter";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, Td, Th } from "@/components/ui/table";
import { Time } from "@/components/ui/time";
import { isForbidden, load } from "@/lib/core";
import { hrefWith, NEWSLETTER_MANAGE, NEWSLETTER_READ, one, PAGE_SIZE } from "@/lib/engage";
import type { Suppression } from "@/lib/newsletter";
import { can } from "@/lib/viewer";

const BASE = "/marketing/newsletter/suppressions";

// Tab "Không gửi": địa chỉ không nhận chiến dịch nào, dù còn đăng ký — bounce cứng, khiếu nại thư
// rác, đủ số bounce mềm, hoặc chặn tay.
export default async function SuppressionsPage(
  props: PageProps<"/marketing/newsletter/suppressions">,
) {
  const t = await getTranslations("engage.newsletter");
  const e = await getTranslations("emptyStates");
  const params = await props.searchParams;
  const email = one(params, "email");
  const cursor = one(params, "cursor", 500);
  let page: { data: Suppression[]; pagination: { next_cursor?: string | null } };
  try {
    page = await load((client) =>
      client.GET("/api/v1/newsletter/suppressions", {
        params: {
          query: { limit: PAGE_SIZE, ...(email ? { email } : {}), ...(cursor ? { cursor } : {}) },
        },
      }),
    );
  } catch (error) {
    if (isForbidden(error)) return <Forbidden permission={NEWSLETTER_READ} />;
    throw error;
  }
  const manage = await can(NEWSLETTER_MANAGE);
  const next = page.pagination.next_cursor;
  return (
    <div className="blocks">
      <section className="block" aria-labelledby="sup-h">
        <div className="block-head">
          <h2 id="sup-h" className="h2">
            {t("suppressions")}
          </h2>
          {manage ? <SuppressDialog /> : null}
        </div>
        <p className="fhint">{t("suppressionsAbout")}</p>
        <form method="get" action={BASE} className="filters">
          <AutoFilter />
          <label className="fld grow">
            <span className="lab">{t("searchEmail")}</span>
            <input
              className="inp"
              type="search"
              name="email"
              defaultValue={email ?? ""}
              placeholder={t("searchEmailHint")}
              maxLength={200}
            />
          </label>
          <div className="filters-acts">
            <button type="submit" className="btn">
              {t("apply")}
            </button>
            {email ? (
              <Link className="btn ghost" href={BASE}>
                {t("clear")}
              </Link>
            ) : null}
          </div>
        </form>
        <div className="card tcard">
          {page.data.length === 0 ? (
            email ? (
              <p className="empty">{t("noMatch")}</p>
            ) : (
              <EmptyState icon="mail" title={t("noSuppressions")}>
                {e("suppressions.body")}
              </EmptyState>
            )
          ) : (
            <Table cards>
              <thead>
                <tr>
                  <Th>{t("col.email")}</Th>
                  <Th>{t("col.reason")}</Th>
                  <Th>{t("col.note")}</Th>
                  <Th>{t("col.since")}</Th>
                  {manage ? <Th>{t("col.actions")}</Th> : null}
                </tr>
              </thead>
              <tbody>
                {page.data.map((s) => (
                  <tr key={s.id}>
                    <Td className="rt-title">
                      <span className="mono ell">{s.email}</span>
                    </Td>
                    <Td label={t("col.reason")}>
                      <span className="badge b-bad">
                        <span className="dot" />
                        {t.has(`reason.${s.reason}`) ? t(`reason.${s.reason}`) : s.reason}
                      </span>
                    </Td>
                    <Td label={t("col.note")}>{s.note || "—"}</Td>
                    <Td className="whitespace-nowrap" label={t("col.since")}>
                      <Time value={s.created_at} />
                    </Td>
                    {manage ? (
                      <Td label={t("col.actions")}>
                        <ConfirmButton
                          action={removeSuppression}
                          fields={{ id: s.id }}
                          label={t("unsuppress")}
                          title={t("unsuppressTitle", { email: s.email })}
                          points={[t("unsuppressMail"), t("unsuppressBounce")]}
                          submit={t("unsuppressSubmit")}
                          done={t("unsuppressed")}
                          danger={false}
                        />
                      </Td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </div>
        <Pager
          first={cursor ? hrefWith(BASE, { email }) : null}
          next={next ? hrefWith(BASE, { email, cursor: next }) : null}
        />
      </section>
    </div>
  );
}
