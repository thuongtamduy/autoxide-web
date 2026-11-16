import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { ChangeButtons } from "@/components/engage/actions";
import { Chips, Forbidden } from "@/components/engage/common";
import { FormDialog } from "@/components/ui/form-dialog";
import { Table, Td, Th } from "@/components/ui/table";
import { Time } from "@/components/ui/time";
import { formatMoney } from "@/lib/format";
import { LISTING_BADGE, MARKETPLACE_LISTINGS_REVIEW } from "@/lib/market";
import { can } from "@/lib/viewer";
import { type Finding, type ListingStatus, listListingReviews } from "@/sample/market";
import { delistAction, listingChangeAction, rejectListingAction } from "../actions";
import { param } from "../shared";

const FILTERS: ListingStatus[] = ["pending", "approved", "rejected", "delisted"];

// Tab "Duyệt sản phẩm": sản phẩm mới hay sửa của người bán chờ duyệt trước khi hiện trên sàn. Hệ
// thống tự điền phát hiện từ danh mục hàng cấm / có điều kiện (gói dữ liệu của `catalog`) và tình
// trạng người bán; người duyệt quyết. Hàng có điều kiện thiếu giấy tờ thì không duyệt được.
export default async function ListingsTab(props: PageProps<"/market/listings">) {
  if (!(await can(MARKETPLACE_LISTINGS_REVIEW))) {
    return <Forbidden permission={MARKETPLACE_LISTINGS_REVIEW} />;
  }
  const [t, locale, params] = await Promise.all([
    getTranslations("market"),
    getLocale(),
    props.searchParams,
  ]);
  const chosen = param(params, "status");
  const status = chosen === "all" ? undefined : (FILTERS.find((s) => s === chosen) ?? "pending");
  const open = param(params, "open");
  const [{ data: listings }, { data: all }] = await Promise.all([
    listListingReviews(status ? { status } : {}),
    listListingReviews(),
  ]);
  const href = (change: Record<string, string | null>) => {
    const next = new URLSearchParams();
    const merged = { status: chosen, ...change };
    for (const [key, value] of Object.entries(merged)) if (value) next.set(key, value);
    const query = next.toString();
    return query ? `/market/listings?${query}` : "/market/listings";
  };
  const docNames = (types: string) =>
    types
      .split(",")
      .filter(Boolean)
      .map((type) => t(`docType.${type}`))
      .join(", ");
  const findingText = (f: Finding) =>
    f.code === "seller_not_eligible"
      ? t("listings.finding.seller_not_eligible", {
          status: t(`sellerStatus.${f.params.status ?? "draft"}`),
        })
      : t(`listings.finding.${f.code}`, {
          rule: f.params.rule ?? "",
          documents: docNames(f.params.documents ?? ""),
        });
  return (
    <div className="blocks">
      <section className="block" aria-labelledby="mk-listings-h">
        <h2 id="mk-listings-h" className="h2">
          {t("listings.title")}
        </h2>
        <p className="fhint">{t("listings.about")}</p>
        <Chips
          label={t("listings.filter")}
          chips={[
            ...FILTERS.map((s) => ({
              href: href({ status: s === "pending" ? null : s, open: null }),
              label: t(`listingStatus.${s}`),
              on: status === s,
              count: all.filter((l) => l.status === s).length,
            })),
            {
              href: href({ status: "all", open: null }),
              label: t("all"),
              on: status === undefined,
              count: all.length,
            },
          ]}
        />
        <div className="card tcard">
          {listings.length === 0 ? (
            <p className="empty">{t("listings.empty")}</p>
          ) : (
            <Table cards>
              <thead>
                <tr>
                  <Th>{t("listings.product")}</Th>
                  <Th>{t("listings.seller")}</Th>
                  <Th>{t("listings.findings")}</Th>
                  <Th>{t("listings.state")}</Th>
                  <Th>
                    <span className="vh">{t("actions")}</span>
                  </Th>
                </tr>
              </thead>
              <tbody>
                {listings.map((l) => {
                  const isOpen = open === l.id;
                  const blocking = l.findings.some((f) => f.code !== "seller_not_eligible");
                  return [
                    <tr key={l.id} data-current={isOpen ? "" : undefined}>
                      <Td className="rt-title">
                        <span className="cell2">
                          <Link
                            className="open"
                            href={
                              isOpen
                                ? href({ open: null })
                                : `${href({ open: l.id })}#mk-listings-h`
                            }
                            scroll={false}
                            aria-expanded={isOpen}
                          >
                            {l.product_name}
                          </Link>
                          <span className="sub">
                            {t(`listings.change.${l.change}`, { revision: l.revision })} ·{" "}
                            {formatMoney(l.price.amount, l.price.currency, locale)}
                          </span>
                        </span>
                      </Td>
                      <Td label={t("listings.seller")}>{l.seller_name}</Td>
                      <Td label={t("listings.findings")}>
                        {l.findings.length === 0 ? (
                          <span className="tone-ok">{t("listings.noFinding")}</span>
                        ) : (
                          <span className="cell2">
                            {l.findings.map((f) => (
                              <span
                                key={f.code}
                                className={
                                  f.code === "seller_not_eligible" ? "sub tone-warn" : "tone-bad"
                                }
                              >
                                {findingText(f)}
                              </span>
                            ))}
                          </span>
                        )}
                      </Td>
                      <Td label={t("listings.state")}>
                        <span className={LISTING_BADGE[l.status]}>
                          <span className="dot" />
                          {t(`listingStatus.${l.status}`)}
                        </span>
                      </Td>
                      <Td className="rt-acts">
                        {l.status === "pending" ? (
                          <span className="row-acts">
                            <ChangeButtons
                              action={listingChangeAction}
                              id={l.id}
                              expect={l.created_at}
                              moves={[
                                {
                                  value: "approved",
                                  label: t("listings.approve"),
                                  done: t("listings.approved", { name: l.product_name }),
                                  tone: "pri",
                                },
                              ]}
                              undo={{ label: t("undo"), done: t("undone") }}
                            />
                            <FormDialog
                              action={rejectListingAction}
                              label={t("listings.reject")}
                              title={t("listings.rejectTitle", { name: l.product_name })}
                              intro={t("listings.rejectIntro")}
                              submit={t("listings.reject")}
                              done={t("listings.rejected")}
                              fields={[
                                { kind: "hidden", name: "id", value: l.id },
                                {
                                  kind: "textarea",
                                  name: "reason",
                                  label: t("sellers.reason"),
                                  hint: t("sellers.reasonHint"),
                                  ...(blocking
                                    ? { defaultValue: l.findings.map(findingText).join(" ") }
                                    : {}),
                                },
                              ]}
                            />
                          </span>
                        ) : l.status === "approved" ? (
                          <FormDialog
                            action={delistAction}
                            label={t("listings.delist")}
                            title={t("listings.delistTitle", { name: l.product_name })}
                            points={[t("listings.delistPoint1"), t("listings.delistPoint2")]}
                            submit={t("listings.delist")}
                            done={t("listings.delisted")}
                            danger
                            triggerClass="btn sm danger"
                            fields={[
                              { kind: "hidden", name: "id", value: l.id },
                              {
                                kind: "textarea",
                                name: "reason",
                                label: t("listings.delistReason"),
                                hint: t("sellers.reasonHint"),
                              },
                            ]}
                          />
                        ) : null}
                      </Td>
                    </tr>,
                    isOpen ? (
                      <tr key={`${l.id}-open`} className="cat-detail-row">
                        <td colSpan={5}>
                          <div className="cat-detail">
                            <h3 className="h2">{l.product_name}</h3>
                            <dl className="eg-facts">
                              <div>
                                <dt>{t("listings.category")}</dt>
                                <dd>{l.category_name}</dd>
                              </div>
                              <div>
                                <dt>{t("listings.price")}</dt>
                                <dd className="num">
                                  {l.previous_price
                                    ? `${formatMoney(l.previous_price.amount, "VND", locale)} → `
                                    : ""}
                                  {formatMoney(l.price.amount, l.price.currency, locale)}
                                </dd>
                              </div>
                              <div>
                                <dt>{t("listings.images")}</dt>
                                <dd>{t("listings.imageCount", { count: l.images })}</dd>
                              </div>
                              <div>
                                <dt>{t("listings.submitted")}</dt>
                                <dd>
                                  <Time value={l.created_at} />
                                </dd>
                              </div>
                              {l.decided_by && l.decided_at ? (
                                <div>
                                  <dt>{t("listings.decidedBy")}</dt>
                                  <dd>
                                    {l.decided_by} · <Time value={l.decided_at} />
                                  </dd>
                                </div>
                              ) : null}
                              {l.reason ? (
                                <div>
                                  <dt>{t("listings.reason")}</dt>
                                  <dd>{l.reason}</dd>
                                </div>
                              ) : null}
                            </dl>
                            {l.findings
                              .filter((f) => f.legal_basis)
                              .map((f) => (
                                <p key={f.code} className="note cp-basis">
                                  <b>{findingText(f)}</b>{" "}
                                  {t("listings.basis", { basis: f.legal_basis ?? "" })}
                                </p>
                              ))}
                            <p className="fhint">{t("listings.note")}</p>
                          </div>
                        </td>
                      </tr>
                    ) : null,
                  ];
                })}
              </tbody>
            </Table>
          )}
        </div>
      </section>
    </div>
  );
}
