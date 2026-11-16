import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { QuickAdjustForm } from "@/components/inventory/forms";
import { Table, Td, Th } from "@/components/ui/table";
import { Time } from "@/components/ui/time";
import { INVENTORY_ADJUST, signed } from "@/lib/catalog";
import { formatMoney } from "@/lib/format";
import { can } from "@/lib/viewer";
import { listMovements, type MovementKind, warehouses } from "@/sample/inventory";

const KINDS: (MovementKind | "transfer")[] = [
  "receipt",
  "sale",
  "adjustment",
  "transfer",
  "count",
  "return",
  "expiry",
  "supplier_return",
];

// Tab "Sổ biến động": sổ chỉ thêm — mọi lần nhập, xuất, chuyển, điều chỉnh, kiểm kê, hết hạn lô là
// một dòng; không sửa, không xoá; ghi sai thì ghi một dòng ngược lại kèm lý do. Là chứng từ kho.
export default async function MovesPage(props: PageProps<"/catalog/inventory/moves">) {
  const [t, locale, params] = await Promise.all([
    getTranslations("inventory"),
    getLocale(),
    props.searchParams,
  ]);
  const one = (name: string) => (typeof params[name] === "string" ? (params[name] as string) : "");
  const kind = KINDS.find((k) => k === one("kind"));
  const org = one("org");
  const level = one("level");
  const open = one("open");
  const [units, page, adjust] = await Promise.all([
    warehouses(),
    listMovements({
      locale,
      ...(kind ? { kind } : {}),
      ...(org ? { org_id: org } : {}),
      ...(level ? { level_id: level } : {}),
      cursor: one("cursor") || null,
    }),
    can(INVENTORY_ADJUST),
  ]);
  const href = (change: Record<string, string | null>) => {
    const next = new URLSearchParams();
    const merged = { kind: kind ?? "", org, level, ...change };
    for (const [key, value] of Object.entries(merged)) if (value) next.set(key, value);
    const query = next.toString();
    return query ? `/catalog/inventory/moves?${query}` : "/catalog/inventory/moves";
  };
  const options = units.map((u) => ({ value: u.id, label: u.name }));
  return (
    <div className="blocks">
      <p className="fhint">{t("moves.about")}</p>
      <section className="block" aria-labelledby="moves-h">
        <div className="block-head">
          <h2 id="moves-h" className="h2">
            {t("moves.title")}
          </h2>
          {level ? (
            <Link className="btn sm ghost" href={href({ level: null })}>
              {t("moves.allLevels")}
            </Link>
          ) : null}
        </div>
        <nav className="chips" aria-label={t("moves.byKind")}>
          <Link
            className={kind ? "chip" : "chip on"}
            href={href({ kind: null, cursor: null })}
            aria-current={kind ? undefined : "page"}
          >
            {t("moves.all")}
          </Link>
          {KINDS.map((k) => (
            <Link
              key={k}
              className={kind === k ? "chip on" : "chip"}
              href={href({ kind: k, cursor: null })}
              aria-current={kind === k ? "page" : undefined}
            >
              {t(`moveKinds.${k}`)}
            </Link>
          ))}
        </nav>
        <nav className="chips" aria-label={t("levels.warehouse")}>
          <Link
            className={org ? "chip" : "chip on"}
            href={href({ org: null, cursor: null })}
            aria-current={org ? undefined : "page"}
          >
            {t("levels.allWarehouses")}
          </Link>
          {units.map((u) => (
            <Link
              key={u.id}
              className={org === u.id ? "chip on" : "chip"}
              href={href({ org: u.id, cursor: null })}
              aria-current={org === u.id ? "page" : undefined}
            >
              {u.name}
            </Link>
          ))}
        </nav>
        <div className="card tcard">
          {page.data.length === 0 ? (
            <p className="empty">{t("moves.empty")}</p>
          ) : (
            <Table cards>
              <thead>
                <tr>
                  <Th>{t("moves.at")}</Th>
                  <Th>{t("moves.variant")}</Th>
                  <Th>{t("moves.kind")}</Th>
                  <Th className="text-right">{t("moves.quantity")}</Th>
                  <Th>{t("moves.source")}</Th>
                  <Th>{t("moves.actor")}</Th>
                </tr>
              </thead>
              <tbody>
                {page.data.map((m) => {
                  const isOpen = open === m.id;
                  return [
                    <tr key={m.id} data-current={isOpen ? "" : undefined}>
                      <Td className="whitespace-nowrap" label={t("moves.at")}>
                        <Time value={m.created_at} />
                      </Td>
                      <Td className="rt-title">
                        <span className="cell2">
                          <Link
                            className="open"
                            href={isOpen ? href({ open: null }) : `${href({ open: m.id })}#moves-h`}
                            scroll={false}
                            aria-expanded={isOpen}
                          >
                            {m.name}
                          </Link>
                          <span className="sub">
                            <span className="mono">{m.sku}</span> · {m.org_name}
                          </span>
                        </span>
                      </Td>
                      <Td label={t("moves.kind")}>{t(`moveKinds.${m.kind}`)}</Td>
                      <Td
                        label={t("moves.quantity")}
                        className={m.quantity < 0 ? "text-right cat-neg" : "text-right cat-pos"}
                      >
                        <b>{signed(m.quantity, locale)}</b>
                      </Td>
                      <Td label={t("moves.source")}>
                        <span className="cell2">
                          {m.source_type === "opening" ? t("moves.opening") : m.source_label}
                          {m.reason_code && m.reason_code !== "opening_balance" ? (
                            <span className="sub">
                              {t(`reasons.${m.reason_code}`)}
                              {m.note ? `: ${m.note}` : ""}
                            </span>
                          ) : null}
                        </span>
                      </Td>
                      <Td label={t("moves.actor")}>{m.actor?.name ?? t("moves.system")}</Td>
                    </tr>,
                    isOpen ? (
                      <tr key={`${m.id}-open`} className="cat-detail-row">
                        <td colSpan={6}>
                          <div className="cat-detail">
                            <dl className="kv cat-kv">
                              <dt>{t("moves.kindCode")}</dt>
                              <dd className="mono">{m.kind}</dd>
                              <dt>{t("moves.unitCost")}</dt>
                              <dd>
                                {formatMoney(m.unit_cost.amount, m.unit_cost.currency, locale)}
                              </dd>
                              <dt>{t("moves.sourceCode")}</dt>
                              <dd className="mono">
                                {m.source_type} · {m.source_id}
                              </dd>
                              {m.lot_code ? (
                                <>
                                  <dt>{t("moves.lot")}</dt>
                                  <dd className="mono">{m.lot_code}</dd>
                                </>
                              ) : null}
                              {m.reason_code ? (
                                <>
                                  <dt>{t("moves.reasonCode")}</dt>
                                  <dd className="mono">{m.reason_code}</dd>
                                </>
                              ) : null}
                            </dl>
                            <p className="fhint">{t("moves.appendOnly")}</p>
                            {adjust && m.kind === "adjustment" && m.source_type !== "opening" ? (
                              <QuickAdjustForm warehouses={options} org={m.org_id} code={m.sku} />
                            ) : null}
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
        <div className="pager">
          {page.pagination.next_cursor ? (
            <Link className="btn sm" href={href({ cursor: page.pagination.next_cursor })}>
              {t("levels.next")}
            </Link>
          ) : null}
        </div>
      </section>
      {adjust ? (
        <section className="block half" aria-labelledby="quick-h">
          <h2 id="quick-h" className="h2">
            {t("moves.quickTitle")}
          </h2>
          <p className="fhint">{t("moves.quickAbout")}</p>
          <QuickAdjustForm warehouses={options} />
        </section>
      ) : null}
      <section className="block half" aria-labelledby="who-h">
        <h2 id="who-h" className="h2">
          {t("moves.whoTitle")}
        </h2>
        <p className="note">
          <b>{t("moves.whoStrong")}</b> {t("moves.who")}
        </p>
      </section>
    </div>
  );
}
