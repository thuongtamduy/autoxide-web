import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import {
  activateVariantAction,
  archiveProductAction,
  deactivateVariantAction,
  deleteProductAction,
  productStatusAction,
} from "@/app/(admin)/catalog/actions";
import { PRODUCT_BADGE } from "@/components/catalog/badges";
import { DocumentDialog, PriceDialog, VariantDialog } from "@/components/catalog/forms";
import {
  AttributesForm,
  GeneralForm,
  KitchenForm,
  MediaEditor,
  TranslationForm,
} from "@/components/catalog/product-forms";
import { SuggestForm } from "@/components/catalog/suggest-form";
import { SuggestionActions } from "@/components/catalog/suggestion-actions";
import { ChangeButtons, type Move } from "@/components/engage/actions";
import { SampleBadge } from "@/components/sample-badge";
import { ConfirmAction, InlineAction } from "@/components/ui/confirm";
import { Flash } from "@/components/ui/flash";
import { Table, Td, Th } from "@/components/ui/table";
import { Time } from "@/components/ui/time";
import { ToastProvider } from "@/components/ui/toast";
import {
  CATALOG_DOCUMENTS_MANAGE,
  CATALOG_PRICES_WRITE,
  CATALOG_PRODUCTS_PUBLISH,
  CATALOG_PRODUCTS_READ,
  CATALOG_PRODUCTS_WRITE,
  formatDay,
  toVietnamInput,
  vatLabel,
} from "@/lib/catalog";
import { optional } from "@/lib/content-server";
import { load } from "@/lib/core";
import { formatMoney } from "@/lib/format";
import { MEDIA_READ, MEDIA_WRITE } from "@/lib/permissions";
import { can } from "@/lib/viewer";
import {
  CATALOG_LOCALES,
  DOCUMENT_TYPES,
  getProduct,
  listAttributes,
  listCategories,
  listDocuments,
  listPriceLists,
  listRestrictionRules,
  listSuggestions,
  ORG,
  pick,
  pricesAt,
  productHistory,
  readiness,
  requiredAttributeIds,
  translationOf,
  variants,
} from "@/sample/catalog";
import { listTaxRates, rateOn, vietnamDay } from "@/sample/tax";
import { commerceGate } from "../../gate";
import { ENDPOINTS_41, newProductOptions } from "../../shared";
import "@/components/catalog/catalog.css";

// Đường dẫn công khai của sản phẩm: `AUTOXIDE_CATALOG_PRODUCT_PATH_PREFIX` của core (mặc định
// `/products`); core chưa có API đọc cấu hình này.
const PATH_PREFIX = "/products";

// Chi tiết một sản phẩm (dữ liệu mẫu, W-006): trạng thái và điều kiện mở bán, biến thể, giá, thuộc
// tính đồ bếp, thuộc tính của danh mục, ảnh từ thư viện media thật, nội dung và SEO theo ngôn ngữ,
// giấy tờ, bản nháp AI, lịch sử.
export default async function ProductPage(props: PageProps<"/catalog/products/[id]">) {
  const gate = await commerceGate(CATALOG_PRODUCTS_READ);
  if (gate) return gate;
  const [{ id }, params, locale, t] = await Promise.all([
    props.params,
    props.searchParams,
    getLocale(),
    getTranslations("catalog"),
  ]);
  const found = await getProduct(id);
  if (!found) notFound();
  const product = found.data;
  const contentLocale = CATALOG_LOCALES.find((l) => l === params.locale) ?? "vi";
  const [
    write,
    publish,
    pricesWrite,
    documentsManage,
    canMedia,
    canUpload,
    options,
    { data: categories },
    { data: attributes },
    { data: rules },
    { data: documents },
    { data: lists },
    { data: rates },
    { data: drafts },
    { data: history },
    retail,
    { data: parts },
  ] = await Promise.all([
    can(CATALOG_PRODUCTS_WRITE),
    can(CATALOG_PRODUCTS_PUBLISH),
    can(CATALOG_PRICES_WRITE),
    can(CATALOG_DOCUMENTS_MANAGE),
    can(MEDIA_READ),
    can(MEDIA_WRITE),
    newProductOptions(locale),
    listCategories(locale),
    listAttributes(),
    listRestrictionRules(),
    listDocuments(locale),
    listPriceLists(),
    listTaxRates(),
    listSuggestions({ product_id: id }),
    productHistory(id),
    pricesAt(
      ORG.ROOT,
      product.variants.map((v) => v.id),
    ),
    variants(product.components.map((c) => c.variant_id)),
  ]);
  // Ảnh và tệp hướng dẫn đọc THẬT từ thư viện media của core (tên, công khai hay chưa).
  const [mediaItems, manuals, aiStatus] = await Promise.all([
    canMedia
      ? Promise.all(
          product.media.map((m) =>
            optional(
              load((c) => c.GET("/api/v1/media/{id}", { params: { path: { id: m.media_id } } })),
            ),
          ),
        )
      : Promise.resolve([]),
    canMedia
      ? optional(
          load((c) =>
            c.GET("/api/v1/media", { params: { query: { type: "application/pdf", limit: 50 } } }),
          ),
        )
      : Promise.resolve(null),
    canMedia ? optional(load((c) => c.GET("/api/v1/ai/status"))) : Promise.resolve(null),
  ]);
  const ai = aiStatus?.data;

  const translation = translationOf(product, locale);
  const content = product.translations.find((tr) => tr.locale === contentLocale);
  const category = categories.find((c) => c.id === product.primary_category_id);
  const issues = readiness(product);
  const required = new Set(requiredAttributeIds(product.primary_category_id));
  const upcoming = (category ? categories.filter((c) => category.path.startsWith(c.path)) : [])
    .flatMap((c) => c.attributes)
    .filter((a) => a.effective_from > vietnamDay());
  const restrictions = category
    ? rules.filter((r) =>
        categories.some(
          (c) => category.path.startsWith(c.path) && c.restriction_codes.includes(r.code),
        ),
      )
    : [];
  const docs = documents.filter((d) => d.product_id === id);
  const money = (amount: string, currency: string) => formatMoney(amount, currency, locale);
  const rate = product.tax_category ? rateOn(rates, product.tax_category) : null;
  const editable = write && product.status !== "archived";
  const moves: Move[] =
    product.status === "draft"
      ? [
          {
            value: "active",
            label: t("product.publish"),
            done: t("product.published"),
            tone: "pri",
          },
        ]
      : product.status === "active"
        ? [{ value: "inactive", label: t("product.unpublish"), done: t("product.unpublished") }]
        : product.status === "inactive"
          ? [
              {
                value: "active",
                label: t("product.republish"),
                done: t("product.published"),
                tone: "pri",
              },
            ]
          : [];
  const variantLabel = (v: (typeof product.variants)[number]) =>
    v.label ? `${v.label} · ${v.sku}` : v.sku;
  const kitchen = product.kitchen;
  const fromInput = toVietnamInput(new Date(Date.now() + 86_400_000).toISOString()).slice(0, 10);

  return (
    <ToastProvider>
      <div className="page cat-page">
        {params.created ? <Flash text={t("new.created")} /> : null}
        <section className="phead">
          <div className="phead-main">
            <span className="crumb ell">
              <Link href="/catalog">{t("title")}</Link> › {category?.path ?? "—"}
            </span>
            <h1 className="h1">{translation.name}</h1>
            <p className="pdesc">
              {t(`kinds.${product.kind}`)} · {t("product.owner")} ·{" "}
              <span className="mono">{`${PATH_PREFIX}/${translation.slug}`}</span>
            </p>
            <span className="cat-sample">
              <span className={PRODUCT_BADGE[product.status]}>
                <span className="dot" />
                {t(`status.${product.status}`)}
              </span>
              {product.ai_assisted ? (
                <span className="badge b-info">{t("product.aiAssisted")}</span>
              ) : null}
              <SampleBadge step="41" endpoint={ENDPOINTS_41} />
            </span>
          </div>
          {publish ? (
            <div className="headacts">
              {moves.length > 0 ? (
                <ChangeButtons
                  action={productStatusAction}
                  id={product.id}
                  expect={product.updated_at}
                  moves={moves}
                  undo={{ label: t("undo"), done: t("undone") }}
                  small={false}
                />
              ) : null}
              {product.status === "inactive" ? (
                <ConfirmAction
                  action={archiveProductAction}
                  id={product.id}
                  label={t("product.archive")}
                  title={t("product.archiveTitle", { name: translation.name })}
                  points={[
                    t("product.archiveHidden"),
                    t("product.archiveOrders"),
                    t("product.archiveFinal"),
                  ]}
                  submit={t("product.archiveSubmit")}
                  done={t("product.archived")}
                />
              ) : null}
              {!product.ever_active && write ? (
                <ConfirmAction
                  action={deleteProductAction}
                  id={product.id}
                  label={t("product.delete")}
                  title={t("product.deleteTitle", { name: translation.name })}
                  points={[t("product.deleteGone"), t("product.deleteOnlyDraft")]}
                  submit={t("product.deleteSubmit")}
                  done={t("product.deleted")}
                />
              ) : null}
            </div>
          ) : null}
        </section>

        <div className="blocks">
          {product.status !== "active" && product.status !== "archived" ? (
            <section className="block" aria-labelledby="ready-h">
              <div className="block-head">
                <h2 id="ready-h" className="h2">
                  {t("product.readiness")}
                </h2>
              </div>
              {issues.length === 0 ? (
                <p className="note">{t("product.ready")}</p>
              ) : (
                <div className="note warn" role="note">
                  <b>{t("product.notReady", { count: issues.length })}</b>
                  <ul className="dlg-list">
                    {issues.map((issue) => (
                      <li key={issue.code}>
                        <span className="mono">{issue.code}</span> —{" "}
                        {t(`issues.${issue.code.replaceAll(".", "_")}`, issue.params)}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>
          ) : null}

          <section className="block" aria-labelledby="general-h">
            <div className="block-head">
              <h2 id="general-h" className="h2">
                {t("product.general.title")}
              </h2>
            </div>
            <dl className="card kv">
              <dt>{t("product.general.tax")}</dt>
              <dd>
                {product.tax_category ? (
                  <>
                    {vatLabel(rate?.rate_percent ?? null, t("vatShort"))} ·{" "}
                    <span className="mono">{product.tax_category}</span>
                    {rate?.effective_to
                      ? ` · ${t("product.general.rateUntil", { date: formatDay(rate.effective_to, locale) })}`
                      : ""}
                  </>
                ) : (
                  t("product.general.noTax")
                )}
              </dd>
              <dt>{t("product.general.restriction")}</dt>
              <dd>
                {restrictions.length === 0
                  ? t("product.general.noRestriction")
                  : restrictions
                      .map((r) => `${pick(r.names, locale)} (${t(`categories.levels.${r.level}`)})`)
                      .join(", ")}
              </dd>
              <dt>{t("product.general.stock")}</dt>
              <dd>
                {product.track_inventory
                  ? t("product.general.tracked")
                  : t("product.general.notTracked")}
                {product.allow_backorder ? ` · ${t("product.general.backorder")}` : ""}
                {product.lot_tracked ? ` · ${t("product.general.lot")}` : ""}
                {product.serial_tracked ? ` · ${t("product.general.serial")}` : ""}
              </dd>
              {product.components.length > 0 ? (
                <>
                  <dt>{t("product.general.components")}</dt>
                  <dd>
                    {product.components
                      .map((c) => {
                        const part = parts.find((p) => p.variant_id === c.variant_id);
                        return `${c.quantity} × ${part ? `${part.name}${part.variant_label ? ` ${part.variant_label}` : ""}` : c.variant_id}`;
                      })
                      .join(", ")}
                  </dd>
                </>
              ) : null}
              <dt>{t("product.general.updated")}</dt>
              <dd>
                <Time value={product.updated_at} />
              </dd>
            </dl>
            {editable ? (
              <GeneralForm
                id={product.id}
                categories={options.categories}
                taxes={options.taxes}
                current={{
                  category_id: product.primary_category_id ?? "",
                  tax_category: product.tax_category ?? "",
                  allow_backorder: product.allow_backorder,
                  lot_tracked: product.lot_tracked,
                  serial_tracked: product.serial_tracked,
                }}
                disabled={!editable}
              />
            ) : null}
          </section>

          <section className="block" aria-labelledby="variants-h">
            <div className="block-head">
              <h2 id="variants-h" className="h2">
                {t("product.variants.title")}
              </h2>
              {editable ? (
                <VariantDialog
                  productId={product.id}
                  optionName={product.options[0] ? pick(product.options[0].names, locale) : null}
                  needsOption={product.variants.length > 0}
                  needsOptionName={product.options.length === 0 && product.variants.length > 0}
                />
              ) : null}
              {pricesWrite && product.variants[0] ? (
                <PriceDialog
                  lists={lists.map((l) => ({ value: l.id, label: `${l.name} · ${l.org_name}` }))}
                  code={product.variants[0].sku}
                  from={`${fromInput}T00:00`}
                  reference={`gia-${vietnamDay()}`}
                />
              ) : null}
            </div>
            <p className="fhint">{t("product.variants.about")}</p>
            <div className="card tcard">
              <Table cards>
                <thead>
                  <tr>
                    <Th>{t("product.variants.variant")}</Th>
                    <Th>{t("product.variants.barcode")}</Th>
                    <Th>{t("product.variants.package")}</Th>
                    <Th className="text-right">{t("product.variants.price")}</Th>
                    <Th>{t("product.variants.state")}</Th>
                    <Th>
                      <span className="vh">{t("product.variants.actions")}</span>
                    </Th>
                  </tr>
                </thead>
                <tbody>
                  {product.variants.map((v) => {
                    const price = retail.get(v.id)?.price;
                    return (
                      <tr key={v.id}>
                        <Td className="rt-title">
                          <span className="cell2">
                            <b>{v.label || translation.name}</b>
                            <span className="sub mono">{v.sku}</span>
                          </span>
                        </Td>
                        <Td label={t("product.variants.barcode")} className="mono">
                          {v.barcode ?? "—"}
                        </Td>
                        <Td label={t("product.variants.package")}>
                          {v.weight_grams === null
                            ? "—"
                            : t("product.variants.grams", { grams: v.weight_grams })}
                          {v.length_mm
                            ? ` · ${t("product.variants.dims", { l: v.length_mm / 10, w: (v.width_mm ?? 0) / 10, h: (v.height_mm ?? 0) / 10 })}`
                            : ""}
                        </Td>
                        <Td
                          label={t("product.variants.price")}
                          className="text-right whitespace-nowrap"
                        >
                          {price ? (
                            <Link className="open" href={`/catalog/prices?variant=${v.id}#history`}>
                              {money(price.amount.amount, price.amount.currency)}
                            </Link>
                          ) : (
                            t("products.noPrice")
                          )}
                        </Td>
                        <Td label={t("product.variants.state")}>
                          <span className={v.active ? "badge b-ok" : "badge b-arch"}>
                            <span className="dot" />
                            {v.active
                              ? t("product.variants.active")
                              : t("product.variants.inactive")}
                          </span>
                        </Td>
                        <Td className="rt-acts">
                          {editable ? (
                            <span className="row-acts">
                              <VariantDialog
                                productId={product.id}
                                variant={{
                                  id: v.id,
                                  sku: v.sku,
                                  barcode: v.barcode ?? "",
                                  weight_grams:
                                    v.weight_grams === null ? "" : String(v.weight_grams),
                                  length_mm: v.length_mm === null ? "" : String(v.length_mm),
                                  width_mm: v.width_mm === null ? "" : String(v.width_mm),
                                  height_mm: v.height_mm === null ? "" : String(v.height_mm),
                                }}
                                optionName={null}
                                needsOption={false}
                                needsOptionName={false}
                              />
                              <InlineAction
                                action={v.active ? deactivateVariantAction : activateVariantAction}
                                id={v.id}
                                label={
                                  v.active
                                    ? t("product.variants.deactivate")
                                    : t("product.variants.activate")
                                }
                                ariaLabel={`${v.active ? t("product.variants.deactivate") : t("product.variants.activate")} ${v.sku}`}
                                done={
                                  v.active
                                    ? t("product.variants.deactivated")
                                    : t("product.variants.activated")
                                }
                              />
                            </span>
                          ) : null}
                        </Td>
                      </tr>
                    );
                  })}
                </tbody>
              </Table>
            </div>
            <p className="fhint">
              {t("product.variants.priceNote")}{" "}
              <Link className="open" href="/catalog/prices">
                {t("product.variants.toPrices")}
              </Link>{" "}
              ·{" "}
              <Link
                className="open"
                href={`/catalog/inventory?q=${encodeURIComponent(product.variants[0]?.sku ?? "")}`}
              >
                {t("product.variants.toStock")}
              </Link>
            </p>
          </section>

          <section className="block" aria-labelledby="kitchen-h">
            <div className="block-head">
              <h2 id="kitchen-h" className="h2">
                {t("product.kitchen.title")}
              </h2>
              <SampleBadge step="mới" endpoint="PUT /api/v1/catalog/products/{id}/kitchen" />
              <LocaleChips
                id={product.id}
                current={contentLocale}
                anchor="kitchen-h"
                label={t("product.locales")}
              />
            </div>
            <p className="fhint">{t("product.kitchen.about")}</p>
            <KitchenForm
              key={`kitchen-${contentLocale}`}
              id={product.id}
              disabled={!editable}
              manuals={(manuals?.data ?? []).map((m) => ({ value: m.id, label: m.name }))}
              current={{
                locale: contentLocale,
                serves: product.variants.map((v) => {
                  const s = kitchen?.serves.find((x) => x.variant_id === v.id);
                  return {
                    variant_id: v.id,
                    label: variantLabel(v),
                    min: s ? String(s.min) : "",
                    max: s ? String(s.max) : "",
                  };
                }),
                in_box: (kitchen?.in_box ?? [])
                  .map((b) => `${b.quantity} × ${b.name[contentLocale] ?? ""}`)
                  .join("\n"),
                not_included: (kitchen?.not_included ?? [])
                  .map((n) => n[contentLocale] ?? "")
                  .join("\n"),
                use: kitchen?.use[contentLocale] ?? "",
                care: kitchen?.care[contentLocale] ?? "",
                dishwasher_safe:
                  kitchen?.dishwasher_safe === null || !kitchen
                    ? ""
                    : kitchen.dishwasher_safe
                      ? "yes"
                      : "no",
                manual_media_id: kitchen?.manual_media_id ?? "",
              }}
            />
          </section>

          <section className="block" aria-labelledby="attrs-h">
            <div className="block-head">
              <h2 id="attrs-h" className="h2">
                {t("product.attributes.title")}
              </h2>
            </div>
            <p className="fhint">
              {t("product.attributes.about", { category: category?.path ?? "—" })}
            </p>
            {upcoming.length > 0 ? (
              <p className="note">
                {t("product.attributes.upcoming", {
                  list: upcoming
                    .map(
                      (u) =>
                        `${pick(attributes.find((a) => a.id === u.attribute_id)?.names ?? {}, locale)} (${formatDay(u.effective_from, locale)})`,
                    )
                    .join(", "),
                })}
              </p>
            ) : null}
            <AttributesForm
              id={product.id}
              disabled={!editable}
              fields={attributes
                .filter(
                  (a) =>
                    required.has(a.id) ||
                    product.attributes.some((p) => p.attribute_id === a.id) ||
                    a.filterable,
                )
                .sort((a, b) => Number(required.has(b.id)) - Number(required.has(a.id)))
                .map((a) => ({
                  id: a.id,
                  code: a.code,
                  name: pick(a.names, locale),
                  type: a.data_type,
                  unit: a.unit,
                  options: a.options.map((o) => ({ value: o.code, label: pick(o.labels, locale) })),
                  required: required.has(a.id),
                  values: product.attributes.find((p) => p.attribute_id === a.id)?.values ?? [],
                }))}
            />
          </section>

          <section className="block" aria-labelledby="images-h">
            <div className="block-head">
              <h2 id="images-h" className="h2">
                {t("product.images.title")}
              </h2>
            </div>
            <p className="fhint">{t("product.images.about")}</p>
            <MediaEditor
              id={product.id}
              disabled={!editable}
              context={translation.name}
              media={{ available: canMedia, canUpload, aiAlt: Boolean(ai?.enabled && ai.images) }}
              variants={product.variants.map((v) => ({ value: v.id, label: variantLabel(v) }))}
              initial={product.media.map((m, index) => {
                const item = mediaItems[index]?.data;
                return {
                  media_id: m.media_id,
                  variant_id: m.variant_id,
                  alt: m.alt,
                  name: item?.name ?? null,
                  public: item ? item.visibility === "public" : true,
                };
              })}
            />
          </section>

          <section className="block" aria-labelledby="seo-h">
            <div className="block-head">
              <h2 id="seo-h" className="h2">
                {t("product.seo.title")}
              </h2>
              <LocaleChips
                id={product.id}
                current={contentLocale}
                anchor="seo-h"
                label={t("product.locales")}
              />
            </div>
            <p className="fhint">
              {content
                ? t("product.seo.about")
                : t("product.seo.missing", { locale: contentLocale.toUpperCase() })}
            </p>
            <TranslationForm
              key={`seo-${contentLocale}`}
              id={product.id}
              pathPrefix={PATH_PREFIX}
              disabled={!editable}
              current={{
                locale: contentLocale,
                name: content?.name ?? "",
                slug: content?.slug ?? "",
                short_description: content?.short_description ?? "",
                description: content?.description ?? "",
                meta_title: content?.meta_title ?? "",
                meta_description: content?.meta_description ?? "",
                ai_assisted: content?.ai_assisted ?? false,
              }}
            />
          </section>

          {restrictions.some((r) => r.level === "conditional") || docs.length > 0 ? (
            <section className="block" aria-labelledby="docs-h">
              <div className="block-head">
                <h2 id="docs-h" className="h2">
                  {t("documents.title")}
                </h2>
                {documentsManage ? (
                  <DocumentDialog
                    products={[{ value: product.id, label: translation.name }]}
                    productId={product.id}
                    types={DOCUMENT_TYPES.map((d) => ({
                      value: d,
                      label: t(`documents.types.${d}`),
                    }))}
                    primary
                  />
                ) : null}
              </div>
              <div className="card list">
                {docs.map((d) => (
                  <div className="item" key={d.id}>
                    <div className="item-main">
                      <span className="item-title">{t(`documents.types.${d.document_type}`)}</span>
                      <span className="item-meta">
                        {d.document
                          ? `${d.document.number} · ${formatDay(d.document.issued_on, locale)} · ${d.document.expires_on ? t("documents.until", { date: formatDay(d.document.expires_on, locale) }) : t("documents.noExpiry")}`
                          : t("documents.notSubmitted")}
                      </span>
                    </div>
                    <span
                      className={
                        d.status === "valid"
                          ? "badge b-ok"
                          : d.status === "expiring"
                            ? "badge b-warn"
                            : "badge b-bad"
                      }
                    >
                      <span className="dot" />
                      {t(`documents.status.${d.status}`)}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          <section className="block" aria-labelledby="ai">
            <div className="block-head">
              <h2 id="ai" className="h2">
                {t("ai.productTitle")}
              </h2>
            </div>
            <p className="fhint">{t("ai.about")}</p>
            {editable ? <SuggestForm id={product.id} enabled={Boolean(ai?.enabled)} /> : null}
            <div className="card list">
              {drafts.length === 0 ? <p className="empty">{t("ai.none")}</p> : null}
              {drafts.map((draft) => (
                <div className="item" key={draft.id}>
                  <div className="item-main">
                    <span className="item-title">
                      {t("ai.fields", {
                        locale: draft.locale.toUpperCase(),
                        fields: Object.keys(draft.fields)
                          .map((f) => t(`ai.field.${f}`))
                          .join(", "),
                      })}
                    </span>
                    {Object.entries(draft.fields).map(([field, text]) => (
                      <span className="item-meta cat-draft" key={field}>
                        <b>{t(`ai.field.${field}`)}:</b> {text}
                      </span>
                    ))}
                    <span className="item-meta">
                      {t("ai.when")} <Time value={draft.created_at} />
                      {draft.note ? ` · ${draft.note}` : ""}
                    </span>
                  </div>
                  <span
                    className={
                      draft.status === "pending"
                        ? "badge b-info"
                        : draft.status === "applied"
                          ? "badge b-ok"
                          : "badge b-arch"
                    }
                  >
                    {t(`ai.states.${draft.status}`)}
                  </span>
                  {draft.status === "pending" && editable ? (
                    <SuggestionActions id={draft.id} />
                  ) : null}
                </div>
              ))}
            </div>
          </section>

          <section className="block" aria-labelledby="history-h">
            <div className="block-head">
              <h2 id="history-h" className="h2">
                {t("history.title")}
              </h2>
            </div>
            {history.length === 0 ? (
              <p className="fhint">{t("history.empty")}</p>
            ) : (
              <ol className="card padded timeline">
                {history.map((event) => (
                  <li key={`${event.at}-${event.kind}`}>
                    <span className="sub">
                      <Time value={event.at} /> · {event.actor.name}
                    </span>
                    {t(`history.${event.kind}`, {
                      ...event.params,
                      from: event.params.from ? t(`status.${event.params.from}`) : "",
                      to: event.params.to ? t(`status.${event.params.to}`) : "",
                    })}
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
      </div>
    </ToastProvider>
  );
}

/** Chọn ngôn ngữ nội dung đang sửa (`?locale=`), giữ vị trí của khối trên trang. */
function LocaleChips({
  id,
  current,
  anchor,
  label,
}: {
  id: string;
  current: string;
  anchor: string;
  label: string;
}) {
  return (
    <nav className="chips cat-locales" aria-label={label}>
      {CATALOG_LOCALES.map((l) => (
        <Link
          key={l}
          className={l === current ? "chip on" : "chip"}
          href={`/catalog/products/${id}?locale=${l}#${anchor}`}
          aria-current={l === current ? "page" : undefined}
          scroll={false}
        >
          {l.toUpperCase()}
        </Link>
      ))}
    </nav>
  );
}
