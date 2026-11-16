import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { historyText } from "@/components/promotions/views";
import { Table, Td, Th } from "@/components/ui/table";
import { formatMoney } from "@/lib/format";
import { bpPercent, vnDateTime } from "@/lib/promotions";
import {
  listPromotions,
  listVersions,
  type PromotionSnapshot,
  type VersionRow,
} from "@/sample/promotions";

// Tab "Lịch sử phiên bản": từ lúc bật, mỗi lần đổi chương trình thêm một phiên bản (chỉ thêm, không
// sửa, không xoá). Mỗi phiên bản là ảnh chụp đủ để dựng lại chương trình đúng như lúc đó — dùng khi
// khách khiếu nại hay khi cơ quan kiểm tra. Mở một dòng để xem khác gì phiên bản trước.
export default async function VersionsPage(props: PageProps<"/marketing/promotions/versions">) {
  const [t, locale, params] = await Promise.all([
    getTranslations("promotions"),
    getLocale(),
    props.searchParams,
  ]);
  const one = (name: string) => (typeof params[name] === "string" ? (params[name] as string) : "");
  const promotion = one("promotion");
  const open = one("open");
  const [{ data: rows }, { data: programs }] = await Promise.all([
    listVersions({ ...(promotion ? { promotion_id: promotion } : {}), locale }),
    listPromotions({ locale }),
  ]);
  const withVersions = programs.filter((p) => p.version > 0);
  const href = (change: Record<string, string | null>) => {
    const next = new URLSearchParams();
    const merged = { promotion, ...change };
    for (const [key, value] of Object.entries(merged)) if (value) next.set(key, value);
    const query = next.toString();
    return query ? `/marketing/promotions/versions?${query}` : "/marketing/promotions/versions";
  };
  const show = (field: keyof PromotionSnapshot, value: string) => {
    if (!value) return "—";
    if (field === "starts_at" || field === "ends_at") return vnDateTime(value, locale);
    if (field === "value_bp") return `${bpPercent(Number(value), locale)}%`;
    if (field === "value" || field === "min_order") return formatMoney(value, "VND", locale);
    if (field === "status") return t(`status.${value}`);
    if (field === "notice_status") return t(`noticeStatus.${value}`);
    return value;
  };
  const key = (v: VersionRow) => `${v.promotion_id}:${v.version}`;
  const texts = new Map(
    await Promise.all(
      rows.map(
        async (v) => [key(v), await historyText(v.change.code, v.change.params, locale)] as const,
      ),
    ),
  );
  return (
    <div className="blocks">
      <section className="block" aria-labelledby="versions-h">
        <div className="block-head">
          <h2 id="versions-h" className="h2">
            {t("versions.title")}
          </h2>
        </div>
        <p className="fhint">{t("versions.about")}</p>
        <search aria-label={t("versions.filter")}>
          <form className="filters" action="/marketing/promotions/versions">
            <div className="fld grow">
              <label className="lab" htmlFor="ver-p">
                {t("versions.program")}
              </label>
              <select id="ver-p" className="inp" name="promotion" defaultValue={promotion}>
                <option value="">{t("versions.allPrograms")}</option>
                {withVersions.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title}
                  </option>
                ))}
              </select>
            </div>
            <div className="filters-acts">
              <button type="submit" className="btn">
                {t("programs.filter")}
              </button>
            </div>
          </form>
        </search>
        <div className="card tcard">
          {rows.length === 0 ? (
            <p className="empty">{t("versions.empty")}</p>
          ) : (
            <Table cards>
              <thead>
                <tr>
                  <Th>{t("versions.version")}</Th>
                  <Th>{t("versions.change")}</Th>
                  <Th>{t("versions.by")}</Th>
                  <Th>{t("versions.at")}</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((v) => {
                  const isOpen = open === key(v);
                  return [
                    <tr key={key(v)} data-current={isOpen ? "" : undefined}>
                      <Td className="rt-title">
                        <span className="cell2">
                          <Link
                            className="open"
                            href={
                              isOpen ? href({ open: null }) : `${href({ open: key(v) })}#versions-h`
                            }
                            scroll={false}
                            aria-expanded={isOpen}
                          >
                            {t("versions.number", { version: v.version })}
                          </Link>
                          <span className="sub">{v.title}</span>
                        </span>
                      </Td>
                      <Td label={t("versions.change")}>{texts.get(key(v))}</Td>
                      <Td label={t("versions.by")}>{v.changed_by.name}</Td>
                      <Td label={t("versions.at")}>{vnDateTime(v.changed_at, locale)}</Td>
                    </tr>,
                    isOpen ? (
                      <tr key={`${key(v)}-open`} className="cat-detail-row">
                        <td colSpan={4}>
                          <div className="cat-detail">
                            <h3 className="h2">
                              {v.title} · {t("versions.number", { version: v.version })}
                            </h3>
                            <h4 className="pm-h">
                              {v.version === 1 ? t("versions.first") : t("versions.diff")}
                            </h4>
                            {v.changes.length > 0 ? (
                              <ul className="cat-lines">
                                {v.changes.map((c) => (
                                  <li key={c.field}>
                                    <span>{t(`versions.fields.${c.field}`)}</span>
                                    <b>
                                      {show(c.field, c.from)} → {show(c.field, c.to)}
                                    </b>
                                  </li>
                                ))}
                              </ul>
                            ) : (
                              <dl className="cat-kv">
                                <dt>{t("versions.fields.status")}</dt>
                                <dd>{show("status", v.snapshot.status)}</dd>
                                <dt>{t("versions.fields.ends_at")}</dt>
                                <dd>{show("ends_at", v.snapshot.ends_at)}</dd>
                                <dt>{t("versions.fields.usage_limit")}</dt>
                                <dd>{v.snapshot.usage_limit ?? t("detail.noLimit")}</dd>
                              </dl>
                            )}
                            {v.change.params.reason ? (
                              <p className="fhint">
                                {t("versions.reason", { reason: v.change.params.reason })}
                              </p>
                            ) : null}
                            <p className="fhint">{t("versions.snapshotNote")}</p>
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
