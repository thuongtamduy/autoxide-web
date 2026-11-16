import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { Day, TONE_BADGE } from "@/components/compliance/common";
import { Icon, type IconName } from "@/components/shell/icon";
import { Table, Td, Th } from "@/components/ui/table";
import { getOverview, type OverviewTile } from "@/sample/compliance";
import { listRules } from "@/sample/compliance-rules";

const AREA: Record<OverviewTile["area"], { href: string; icon: IconName }> = {
  websites: { href: "/compliance/websites", icon: "globe" },
  kyc: { href: "/compliance/kyc", icon: "user" },
  privacy: { href: "/compliance/privacy", icon: "lock" },
  documents: { href: "/compliance/documents", icon: "posts" },
  reports: { href: "/compliance/reports", icon: "warn" },
};

// Tab "Tình trạng": mỗi ô là một nghĩa vụ theo luật. Ô đỏ chặn một việc kinh doanh, ô vàng cần làm
// trong hạn. Dưới là bộ quy định đang áp dụng (mỗi khoá một phiên bản, có ngày hiệu lực và căn cứ).
export default async function StatusTab() {
  const t = await getTranslations("compliance.status");
  const [{ data: tiles }, { data: rules }, locale] = await Promise.all([
    getOverview(),
    listRules(),
    getLocale(),
  ]);
  // Hạn gần nhất hiện theo ngày (UTC): câu tóm tắt chỉ cần ngày, giờ chính xác ở tab của nó.
  const day = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: "UTC" });
  const facts = (tile: OverviewTile) => ({
    ...tile.facts,
    open: tile.open,
    next: tile.facts.next ? day.format(new Date(String(tile.facts.next))) : "none",
  });
  return (
    <div className="blocks">
      <section className="block" aria-labelledby="cp-status-h">
        <h2 id="cp-status-h" className="h2">
          {t("title")}
        </h2>
        <p className="fhint">{t("about")}</p>
        <ul className="cp-tiles">
          {tiles.map((tile) => (
            <li key={tile.area}>
              <Link href={AREA[tile.area].href} className={`card cp-tile tone-${tile.tone}`}>
                <span className="sq-ic">
                  <Icon name={AREA[tile.area].icon} />
                </span>
                <span className="cp-tile-main">
                  <span className="cp-tile-label">{t(`areas.${tile.area}`)}</span>
                  <b className="cp-tile-state">
                    {t(`state.${tile.area}.${tile.tone === "ok" ? "ok" : "open"}`, facts(tile))}
                  </b>
                  <span className="cp-tile-note">{t(`note.${tile.area}`, facts(tile))}</span>
                </span>
                <span className={TONE_BADGE[tile.tone]}>
                  <span className="dot" />
                  {t(`tone.${tile.tone}`)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="block" aria-labelledby="cp-rules-h">
        <h2 id="cp-rules-h" className="h2">
          {t("rules.title")}
        </h2>
        <p className="fhint">{t("rules.about")}</p>
        <div className="card tcard">
          <Table cards>
            <thead>
              <tr>
                <Th>{t("rules.key")}</Th>
                <Th>{t("rules.version")}</Th>
                <Th>{t("rules.from")}</Th>
                <Th>{t("rules.basis")}</Th>
              </tr>
            </thead>
            <tbody>
              {rules.map((rule) => (
                <tr key={rule.key}>
                  <Td className="rt-title">
                    <span className="cell2">
                      <b>{t(`rules.keys.${rule.key.replaceAll(".", "_")}`)}</b>
                      <span className="sub mono">{rule.key}</span>
                    </span>
                  </Td>
                  <Td label={t("rules.version")}>{rule.version}</Td>
                  <Td label={t("rules.from")}>
                    <Day value={rule.effective_from} />
                  </Td>
                  <Td label={t("rules.basis")}>
                    <span className="cell2">
                      <span>{rule.legal_basis}</span>
                      {rule.needs_legal_review ? (
                        <span className="sub tone-warn">{t("rules.review")}</span>
                      ) : null}
                    </span>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
      </section>
    </div>
  );
}
