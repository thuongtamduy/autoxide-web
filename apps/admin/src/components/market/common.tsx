import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { Day } from "@/components/compliance/common";
import { Icon } from "@/components/shell/icon";
import { Td } from "@/components/ui/table";
import { Time } from "@/components/ui/time";
import { formatMoney } from "@/lib/format";
import { DISPUTE_BADGE, percentFromBp } from "@/lib/market";
import type { Money } from "@/sample/catalog";
import type {
  DisputeView,
  KycSummary,
  Requirement,
  SellerEvent,
  Settlement,
} from "@/sample/market";

// Khối dùng chung của phân hệ Sàn (Server Component): ô số liệu, danh sách điều kiện để bán, lịch sử,
// bảng quyết toán, hồ sơ tranh chấp. Màn vận hành của sàn và Trung tâm người bán dùng cùng một khối,
// để hai bên thấy cùng một sự thật.

export function Kpis({
  label,
  items,
}: {
  label: string;
  items: readonly { label: string; value: string; sub: string }[];
}) {
  return (
    <section className="block" aria-label={label}>
      <div className="kpis">
        {items.map((item) => (
          <div key={item.label} className="card kpi">
            <span className="kpi-label">{item.label}</span>
            <b className="kpi-value num">{item.value}</b>
            <span className="kpi-sub">{item.sub}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

/** Tóm tắt định danh (KYC) trong một dòng: cách xác thực, hạn, hay đang chờ / bị trả lại. */
export function KycLine({ kyc }: { kyc: KycSummary }) {
  const t = useTranslations("market.kyc");
  const method = kyc.method ? t(`method.${kyc.method}`) : "";
  if (kyc.state === "verified" && kyc.expires_at) {
    return (
      <span className="cell2">
        <span>
          {method} · {t("until")} <Time value={kyc.expires_at} date />
        </span>
        {kyc.renewal_pending ? <span className="sub">{t("renewal")}</span> : null}
      </span>
    );
  }
  if (kyc.state === "expired" && kyc.expires_at) {
    return (
      <span className="cell2">
        <span className="tone-bad">
          {t("expired")} <Time value={kyc.expires_at} date />
        </span>
      </span>
    );
  }
  return (
    <span className="cell2">
      <span className={kyc.state === "rejected" ? "tone-bad" : "tone-warn"}>
        {t(`state.${kyc.state}`)}
      </span>
      {kyc.state === "pending" && kyc.documents_missing ? (
        <span className="sub">{t("documentsMissing")}</span>
      ) : kyc.reason_code ? (
        <span className="sub">{t(`reason.${kyc.reason_code}`)}</span>
      ) : method ? (
        <span className="sub">{method}</span>
      ) : null}
    </span>
  );
}

const REQ_LOOK = {
  ok: { tone: "ok", icon: "check" },
  wait: { tone: "warn", icon: "info" },
  bad: { tone: "bad", icon: "x" },
} as const;

/** Một điều kiện của "được bán không", có lối sửa khi còn thiếu. */
export function Requirements({
  items,
  docNames,
  fix,
  explain,
}: {
  items: readonly Requirement[];
  docNames: (types: string) => string;
  /** Câu riêng cho một điều kiện (vd lời dặn cho người bán thay cho câu của người vận hành sàn). */
  explain?: (item: Requirement) => string | null;
  /** Nút hay link sửa của từng điều kiện còn thiếu (theo khoá). */
  fix?: Partial<Record<Requirement["key"], React.ReactNode>>;
}) {
  const t = useTranslations("market.req");
  const tk = useTranslations("market.kyc.method");
  return (
    <ul className="cp-check">
      {items.map((item) => {
        const waiting =
          !item.ok && ["pending", "submitted", "not_submitted"].includes(item.state)
            ? "wait"
            : item.ok
              ? "ok"
              : "bad";
        const look = REQ_LOOK[waiting];
        return (
          <li key={item.key} className={`tone-${look.tone}`}>
            <span className="cp-check-ic" aria-hidden="true">
              <Icon name={look.icon} />
            </span>
            <span className="cp-check-main">
              <span>
                {t(`${item.key}.title`, {
                  title: item.params.title ?? "",
                  version: item.params.version ?? "",
                })}
              </span>
              <span className="sub">
                {explain?.(item) ??
                  t(`${item.key}.${item.state}`, {
                    method: item.params.method ? tk(item.params.method) : "",
                    last4: item.params.last4 ?? "",
                    documents: docNames(item.params.documents ?? ""),
                  })}
                {item.at ? (
                  <>
                    {" · "}
                    <Time value={item.at} date />
                  </>
                ) : null}
              </span>
            </span>
            {!item.ok && fix?.[item.key] ? fix[item.key] : null}
          </li>
        );
      })}
    </ul>
  );
}

/** Lịch sử của người bán, mới nhất trước. */
export function History({ events }: { events: readonly SellerEvent[] }) {
  const t = useTranslations("market.event");
  return (
    <ol className="timeline">
      {events.map((e) => (
        <li key={`${e.at}-${e.kind}`}>
          <span>
            {t.has(e.kind) ? t(e.kind) : e.kind}
            {e.note && t.has(`note.${e.note}`)
              ? ` · ${t(`note.${e.note}`)}`
              : e.note && e.kind !== "penalty"
                ? ` · ${e.note}`
                : ""}
          </span>
          <span className="sub">
            <Time value={e.at} /> · {e.actor === "system" ? t("system") : e.actor}
          </span>
        </li>
      ))}
    </ol>
  );
}

/** Các dòng của bảng quyết toán / đợt chi: tiền hàng, phí, thuế khấu trừ thay, thực chi. */
export function MoneyLines({
  gross,
  fees,
  feeVat,
  vat,
  pit,
  net,
  commissionBp,
  vatPercent,
  pitPercent,
  netLabel,
}: {
  gross: Money;
  fees: Money;
  feeVat: Money;
  vat: Money;
  pit: Money;
  net: Money;
  commissionBp?: number;
  vatPercent?: string | null;
  pitPercent?: string | null;
  netLabel: string;
}) {
  const t = useTranslations("market.money");
  const locale = useLocale();
  const money = (m: Money) => formatMoney(m.amount, m.currency, locale);
  const minus = (m: Money) => (Number(m.amount) === 0 ? money(m) : `−${money(m)}`);
  const feeNet = {
    amount: String(Number(fees.amount) - Number(feeVat.amount)),
    currency: fees.currency,
  };
  const pct = (p: string | null | undefined) =>
    p ? new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(Number(p)) : "";
  const rows: [string, string, boolean][] = [
    [t("gross"), money(gross), false],
    [
      commissionBp !== undefined
        ? t("commissionRate", { rate: percentFromBp(commissionBp, locale) })
        : t("commission"),
      minus(feeNet),
      false,
    ],
    [t("feeVat"), minus(feeVat), false],
  ];
  if (Number(vat.amount) > 0 || vatPercent) {
    rows.push([vatPercent ? t("vatRate", { rate: pct(vatPercent) }) : t("vat"), minus(vat), false]);
  }
  if (Number(pit.amount) > 0 || pitPercent) {
    rows.push([pitPercent ? t("pitRate", { rate: pct(pitPercent) }) : t("pit"), minus(pit), false]);
  }
  rows.push([netLabel, money(net), true]);
  return (
    <dl className="mk-lines">
      {rows.map(([label, value, strong]) => (
        <div key={label} className={strong ? "mk-total" : undefined}>
          <dt>{label}</dt>
          <dd className="num">{strong ? <b>{value}</b> : value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Quyết toán theo đơn (sao kê): tiền hàng, phí gồm GTGT, khấu trừ thay, thực nhận, trạng thái. */
export function SettlementRow({ s }: { s: Settlement }) {
  const t = useTranslations("market.money");
  const locale = useLocale();
  const money = (m: Money) => formatMoney(m.amount, m.currency, locale);
  const withheld = Number(s.withholding_vat.amount) + Number(s.withholding_pit.amount);
  const counted = s.status !== "pending";
  return (
    <>
      <Td label={t("gross")} className="text-right num">
        {money(s.gross)}
      </Td>
      <Td label={t("feeIncl")} className="text-right num">
        {counted ? `−${money(s.fees)}` : "—"}
      </Td>
      <Td label={t("withheld")} className="text-right num">
        {counted && withheld > 0 ? `−${money({ amount: String(withheld), currency: "VND" })}` : "—"}
      </Td>
      <Td label={t("net")} className="text-right num">
        {counted ? <b>{money(s.net)}</b> : t("notYet")}
      </Td>
    </>
  );
}

/** Hồ sơ tranh chấp: lời của người mua, người bán và sàn theo thời gian. */
export function DisputeThread({ d }: { d: DisputeView }) {
  const t = useTranslations("market.disputes");
  return (
    <ol className="timeline">
      {d.messages.map((m) => (
        <li key={m.id}>
          <span>
            <b>{t(`author.${m.author_kind}`)}</b> · {t(`kind.${m.kind}`)}
            {m.body ? <>: {m.body}</> : null}
            {m.media_count > 0 ? (
              <span className="sub"> · {t("media", { count: m.media_count })}</span>
            ) : null}
          </span>
          <span className="sub">
            <Time value={m.at} />
          </span>
        </li>
      ))}
    </ol>
  );
}

export function DisputeBadge({ status }: { status: string }) {
  const t = useTranslations("market.disputeStatus");
  return (
    <span className={DISPUTE_BADGE[status] ?? "badge"}>
      <span className="dot" />
      {t(status)}
    </span>
  );
}

/** Hạn còn lại tới một thời điểm (giờ), hay đã quá hạn. */
export function DueIn({ until }: { until: string }) {
  const t = useTranslations("market.due");
  const left = Date.parse(until) - Date.now();
  if (left <= 0) return <span className="due bad">{t("overdue")}</span>;
  const hours = Math.floor(left / 3_600_000);
  if (hours < 48) return <span className="due">{t("hours", { hours })}</span>;
  return <span className="due">{t("days", { days: Math.floor(hours / 24) })}</span>;
}

/** Ngày lịch (ngày hiệu lực, kỳ chi) không đổi múi giờ. */
export { Day };

/** Link sang màn Tuân thủ (KYC, văn bản) — nơi duy nhất duyệt định danh. */
export function ComplianceLink({ href, label }: { href: string; label: string }) {
  return (
    <Link className="btn sm" href={href}>
      {label}
    </Link>
  );
}
