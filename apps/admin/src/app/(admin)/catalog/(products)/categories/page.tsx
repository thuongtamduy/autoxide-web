import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { removeCategoryAttributeAction } from "@/app/(admin)/catalog/actions";
import { DOCUMENT_BADGE } from "@/components/catalog/badges";
import {
  AttributeDialog,
  CategoryDialog,
  DocumentDialog,
  MoveCategoryDialog,
  RequiredAttributeDialog,
} from "@/components/catalog/forms";
import { InlineAction } from "@/components/ui/confirm";
import { Table, Td, Th } from "@/components/ui/table";
import { CATALOG_CATEGORIES_MANAGE, CATALOG_DOCUMENTS_MANAGE, formatDay } from "@/lib/catalog";
import { formatCount } from "@/lib/format";
import { can } from "@/lib/viewer";
import {
  DOCUMENT_TYPES,
  listAttributes,
  listCategories,
  listDocuments,
  listProducts,
  listRestrictionRules,
  pick,
} from "@/sample/catalog";
import { vietnamDay } from "@/sample/tax";

// Tab "Danh mục và thuộc tính": cây danh mục với thuộc tính bắt buộc có ngày hiệu lực (dữ liệu,
// không viết cứng), thuộc tính dùng chung, danh sách hàng cấm / có điều kiện (gói "vn", chỉ đọc) và
// giấy tờ của hàng có điều kiện.
export default async function CategoriesPage(props: PageProps<"/catalog/categories">) {
  const [t, locale, params] = await Promise.all([
    getTranslations("catalog"),
    getLocale(),
    props.searchParams,
  ]);
  const open = typeof params.open === "string" ? params.open : "";
  const [
    { data: categories },
    { data: attributes },
    { data: rules },
    { data: documents },
    products,
    manage,
    documentsManage,
  ] = await Promise.all([
    listCategories(locale),
    listAttributes(),
    listRestrictionRules(),
    listDocuments(locale),
    listProducts({ locale, limit: 1000 }),
    can(CATALOG_CATEGORIES_MANAGE),
    can(CATALOG_DOCUMENTS_MANAGE),
  ]);
  const today = vietnamDay();
  const attrName = (id: string) =>
    pick(attributes.find((a) => a.id === id)?.names ?? {}, locale) || id;
  const parents = categories.map((c) => ({ value: c.id, label: c.path }));
  const levelOf = (codes: string[]) => {
    const own = rules.filter((r) => codes.includes(r.code));
    if (own.some((r) => r.level === "prohibited")) return "prohibited" as const;
    if (own.length > 0) return "conditional" as const;
    return null;
  };
  // Quy tắc hạn chế áp cho cả nhánh: danh mục con thừa hưởng của cha.
  const inherited = (id: string) => {
    const path = categories.find((c) => c.id === id)?.path ?? "";
    return categories.filter((c) => path.startsWith(c.path)).flatMap((c) => c.restriction_codes);
  };

  return (
    <div className="blocks">
      <p className="fhint">{t("categories.about")}</p>
      <section className="block" aria-labelledby="tree-h">
        <div className="block-head">
          <h2 id="tree-h" className="h2">
            {t("categories.title")}
          </h2>
          {manage ? <CategoryDialog parents={parents} /> : null}
        </div>
        <div className="card tcard">
          <Table cards>
            <thead>
              <tr>
                <Th>{t("categories.category")}</Th>
                <Th className="text-right">{t("categories.products")}</Th>
                <Th>{t("categories.required.title")}</Th>
                <Th>{t("categories.restriction")}</Th>
              </tr>
            </thead>
            <tbody>
              {categories.map((c) => {
                const level = levelOf(inherited(c.id));
                const current = c.attributes.filter((a) => a.effective_from <= today);
                const later = c.attributes.filter((a) => a.effective_from > today);
                const isOpen = open === c.id;
                return [
                  <tr key={c.id} data-current={isOpen ? "" : undefined}>
                    <Td className="rt-title">
                      <span className="cell2" style={{ paddingInlineStart: `${c.depth * 18}px` }}>
                        <Link
                          className="open"
                          href={
                            isOpen
                              ? "/catalog/categories"
                              : `/catalog/categories?open=${c.id}#tree-h`
                          }
                          scroll={false}
                          aria-expanded={isOpen}
                        >
                          {pick(c.names, locale)}
                        </Link>
                        <span className="sub mono">/{c.slugs.vi}</span>
                      </span>
                    </Td>
                    <Td label={t("categories.products")} className="text-right">
                      {formatCount(c.product_count, locale)}
                    </Td>
                    <Td label={t("categories.required.title")}>
                      <span className="cell2">
                        {current.length === 0 ? (
                          <span className="muted">
                            {c.depth > 0 ? t("categories.inheritsOnly") : "—"}
                          </span>
                        ) : (
                          current.map((a) => attrName(a.attribute_id)).join(", ")
                        )}
                        {later.length > 0 ? (
                          <span className="sub">
                            {t("categories.upcoming", {
                              list: later
                                .map(
                                  (a) =>
                                    `${attrName(a.attribute_id)} (${formatDay(a.effective_from, locale)})`,
                                )
                                .join(", "),
                            })}
                          </span>
                        ) : null}
                      </span>
                    </Td>
                    <Td label={t("categories.restriction")}>
                      {level ? (
                        <span className={level === "prohibited" ? "badge b-bad" : "badge b-warn"}>
                          <span className="dot" />
                          {t(`categories.levels.${level}`)}
                        </span>
                      ) : (
                        <span className="muted">{t("categories.none")}</span>
                      )}
                    </Td>
                  </tr>,
                  isOpen ? (
                    <tr key={`${c.id}-open`} className="cat-detail-row">
                      <td colSpan={4}>
                        <div className="cat-detail">
                          <h3 className="h2">{c.path}</h3>
                          <p className="fhint">
                            {t("categories.detailSub", {
                              products: c.product_count,
                              children: c.child_count,
                            })}
                          </p>
                          {c.attributes.length === 0 ? (
                            <p className="fhint">{t("categories.noRequired")}</p>
                          ) : (
                            <ul className="cat-reqs">
                              {c.attributes.map((a) => (
                                <li key={a.attribute_id}>
                                  <span className="cell2">
                                    <b>{attrName(a.attribute_id)}</b>
                                    <span className="sub">
                                      {t("categories.from", {
                                        date: formatDay(a.effective_from, locale),
                                      })}
                                      {a.applies_to_descendants
                                        ? ` · ${t("categories.toChildren")}`
                                        : ""}
                                      {a.legal_basis ? ` · ${a.legal_basis}` : ""}
                                    </span>
                                  </span>
                                  {manage ? (
                                    <InlineAction
                                      action={removeCategoryAttributeAction}
                                      id={`${c.id}|${a.attribute_id}`}
                                      label={t("categories.required.remove")}
                                      ariaLabel={`${t("categories.required.remove")} ${attrName(a.attribute_id)}`}
                                      done={t("categories.required.removed")}
                                    />
                                  ) : null}
                                </li>
                              ))}
                            </ul>
                          )}
                          {manage ? (
                            <span className="row-acts start">
                              <RequiredAttributeDialog
                                id={c.id}
                                name={c.path}
                                today={today}
                                attributes={attributes.map((a) => ({
                                  value: a.id,
                                  label: `${pick(a.names, locale)} (${a.code})`,
                                }))}
                              />
                              <MoveCategoryDialog
                                id={c.id}
                                name={c.path}
                                current={c.parent_id ?? ""}
                                parents={parents.filter((p) => p.value !== c.id)}
                              />
                              <Link className="btn sm" href={`/catalog?category=${c.id}`}>
                                {t("categories.viewProducts")}
                              </Link>
                            </span>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ) : null,
                ];
              })}
            </tbody>
          </Table>
        </div>
      </section>

      <section className="block" aria-labelledby="attrs-h">
        <div className="block-head">
          <h2 id="attrs-h" className="h2">
            {t("attributes.title")}
          </h2>
          {manage ? <AttributeDialog /> : null}
        </div>
        <p className="fhint">{t("attributes.about")}</p>
        <div className="card tcard">
          <Table cards>
            <thead>
              <tr>
                <Th>{t("attributes.code")}</Th>
                <Th>{t("attributes.name")}</Th>
                <Th>{t("attributes.type")}</Th>
                <Th>{t("attributes.unit")}</Th>
                <Th>{t("attributes.filterable")}</Th>
              </tr>
            </thead>
            <tbody>
              {attributes.map((a) => (
                <tr key={a.id}>
                  <Td className="rt-title mono">{a.code}</Td>
                  <Td label={t("attributes.name")}>
                    <span className="cell2">
                      {pick(a.names, locale)}
                      {a.options.length > 0 ? (
                        <span className="sub">
                          {a.options.map((o) => pick(o.labels, locale)).join(", ")}
                        </span>
                      ) : null}
                    </span>
                  </Td>
                  <Td label={t("attributes.type")}>
                    {t(`attributes.types.${a.data_type}`)}
                    {a.data_type === "decimal"
                      ? ` (${t("attributes.digits", { count: a.scale })})`
                      : ""}
                  </Td>
                  <Td label={t("attributes.unit")}>{a.unit ?? "—"}</Td>
                  <Td label={t("attributes.filterable")}>
                    {a.filterable ? t("attributes.yes") : t("attributes.no")}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
      </section>

      <section className="block" aria-labelledby="rules-h">
        <div className="block-head">
          <h2 id="rules-h" className="h2">
            {t("rules.title")}
          </h2>
          <span className="fhint">
            {t("rules.pack", {
              version: rules[0]?.pack_version ?? "—",
              date: formatDay(rules[0]?.effective_from ?? today, locale),
            })}
          </span>
        </div>
        <p className="fhint">{t("rules.about")}</p>
        <div className="card tcard">
          <Table cards>
            <thead>
              <tr>
                <Th>{t("rules.rule")}</Th>
                <Th>{t("rules.documents")}</Th>
                <Th>{t("rules.basis")}</Th>
                <Th>{t("rules.level")}</Th>
              </tr>
            </thead>
            <tbody>
              {rules.map((r) => (
                <tr key={r.id}>
                  <Td className="rt-title">
                    <span className="cell2">
                      <b>{pick(r.names, locale)}</b>
                      <span className="sub mono">{r.code}</span>
                    </span>
                  </Td>
                  <Td label={t("rules.documents")}>
                    {r.required_documents.length === 0
                      ? "—"
                      : r.required_documents.map((d) => t(`documents.types.${d}`)).join(", ")}
                  </Td>
                  <Td label={t("rules.basis")}>{r.legal_basis}</Td>
                  <Td label={t("rules.level")}>
                    <span className={r.level === "prohibited" ? "badge b-bad" : "badge b-warn"}>
                      <span className="dot" />
                      {t(`categories.levels.${r.level}`)}
                    </span>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
      </section>

      <section className="block" aria-labelledby="docs-h">
        <div className="block-head">
          <h2 id="docs-h" className="h2">
            {t("documents.title")}
          </h2>
          {documentsManage ? (
            <DocumentDialog
              products={products.data.map((p) => ({ value: p.id, label: p.name }))}
              types={DOCUMENT_TYPES.map((d) => ({ value: d, label: t(`documents.types.${d}`) }))}
            />
          ) : null}
        </div>
        <p className="fhint">{t("documents.about")}</p>
        <div className="card tcard">
          <Table cards>
            <thead>
              <tr>
                <Th>{t("documents.productDoc")}</Th>
                <Th>{t("documents.numberIssued")}</Th>
                <Th>{t("documents.expires")}</Th>
                <Th>{t("documents.state")}</Th>
              </tr>
            </thead>
            <tbody>
              {documents.map((d) => (
                <tr key={d.id}>
                  <Td className="rt-title">
                    <span className="cell2">
                      <Link className="open" href={`/catalog/products/${d.product_id}#docs-h`}>
                        {d.product_name}
                      </Link>
                      <span className="sub">{t(`documents.types.${d.document_type}`)}</span>
                    </span>
                  </Td>
                  <Td label={t("documents.numberIssued")}>
                    {d.document
                      ? `${d.document.number} · ${formatDay(d.document.issued_on, locale)}`
                      : t("documents.notSubmitted")}
                  </Td>
                  <Td label={t("documents.expires")}>
                    {d.document?.expires_on
                      ? formatDay(d.document.expires_on, locale)
                      : d.document
                        ? t("documents.noExpiry")
                        : "—"}
                  </Td>
                  <Td label={t("documents.state")}>
                    <span className={DOCUMENT_BADGE[d.status]}>
                      <span className="dot" />
                      {t(`documents.status.${d.status}`)}
                    </span>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
      </section>

      <p className="note warn" role="note">
        <b>{t("categories.legalStrong")}</b> {t("categories.legal")}
      </p>
    </div>
  );
}
