import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import {
  cancelCampaign,
  deleteCampaign,
  pauseOrResume,
  scheduleCampaign,
  sendCampaign,
  testCampaign,
  updateCampaign,
} from "@/app/(admin)/marketing/newsletter/actions";
import { ChangeButtons, ConfirmButton } from "@/components/engage/actions";
import { CampaignEditor, ScheduleDialog, TestDialog } from "@/components/engage/campaign-editor";
import { Back, Facts, Forbidden, PageHead } from "@/components/engage/common";
import { SendSetup } from "@/components/engage/send-setup";
import { Flash } from "@/components/ui/flash";
import { Time } from "@/components/ui/time";
import { send } from "@/lib/action";
import { isForbidden, isNotFound, load } from "@/lib/core";
import { count, NEWSLETTER_MANAGE, NEWSLETTER_READ, NEWSLETTER_SEND, pickText } from "@/lib/engage";
import {
  adRules,
  CAMPAIGN_BADGE,
  type Campaign,
  campaignActions,
  type NewsletterList,
  progressPercent,
} from "@/lib/newsletter";
import { loadNewsletterSettings } from "@/lib/newsletter-server";
import { can } from "@/lib/viewer";

// Một chiến dịch: tiến độ gửi (số thật của core, kèm số bị trả về và số huỷ đăng ký từ thư này),
// thao tác theo trạng thái (gửi thử, hẹn giờ, gửi ngay, tạm dừng / tiếp tục có Hoàn tác, huỷ, xoá),
// nội dung, và thư đúng như khi gửi (`GET /campaigns/{id}/preview`: core dựng bằng chính hàm gửi,
// kèm chân thư). Nháp và đã hẹn giờ thì sửa được ngay ở đây; sửa bản đã hẹn giờ đưa nó về nháp
// (core quy định), nên phải hẹn lại.
export default async function CampaignPage(
  props: PageProps<"/marketing/newsletter/campaigns/[id]">,
) {
  const { id } = await props.params;
  const params = await props.searchParams;
  const t = await getTranslations("engage.newsletter");
  const locale = await getLocale();
  let campaign: Campaign;
  let lists: NewsletterList[];
  try {
    [{ data: campaign }, { data: lists }] = await Promise.all([
      load((client) =>
        client.GET("/api/v1/newsletter/campaigns/{id}", { params: { path: { id } } }),
      ),
      load((client) =>
        client.GET("/api/v1/newsletter/lists", { params: { query: { limit: 200 } } }),
      ),
    ]);
  } catch (error) {
    if (isForbidden(error)) return <Forbidden permission={NEWSLETTER_READ} />;
    if (isNotFound(error)) notFound();
    throw error;
  }
  const [manage, sender, settings, preview] = await Promise.all([
    can(NEWSLETTER_MANAGE),
    can(NEWSLETTER_SEND),
    loadNewsletterSettings(),
    // Thiếu cấu hình gửi thì core báo cùng lỗi 503 như khi gửi: hiện câu đó thay cho bản xem trước.
    send((client) =>
      client.GET("/api/v1/newsletter/campaigns/{id}/preview", { params: { path: { id } } }),
    ),
  ]);
  const ads = adRules(settings);
  const allowed = campaignActions(campaign);
  const list = lists.find((l) => l.id === campaign.list_id);
  const listName = list ? pickText(list.name, locale) || list.key : "—";
  const p = campaign.progress;
  const pct = progressPercent(p);
  const version = { id: campaign.id, expect: campaign.updated_at };
  const undo = { label: t("undo"), done: t("undone") };
  const editable = manage && allowed.includes("edit");

  return (
    <div className="page">
      {params.created ? <Flash text={t("campaignCreated")} /> : null}
      <Back href="/marketing/newsletter" label={t("back")} />
      <PageHead
        crumb={t("campaignCrumb", { list: listName })}
        title={campaign.subject}
        badge={
          <span className={CAMPAIGN_BADGE[campaign.status]}>
            <span className="dot" />
            {t(`status.${campaign.status}`)}
          </span>
        }
        description={t(`statusAbout.${campaign.status}`)}
      />

      {sender && allowed.includes("send") ? <SendSetup settings={settings} /> : null}

      <div className="eg-acts">
        {sender && allowed.includes("test") ? <TestDialog action={testCampaign} id={id} /> : null}
        {sender && allowed.includes("schedule") ? (
          <ScheduleDialog
            action={scheduleCampaign}
            id={id}
            expect={campaign.updated_at}
            current={campaign.scheduled_at}
          />
        ) : null}
        {sender && allowed.includes("send") ? (
          <ConfirmButton
            action={sendCampaign}
            fields={version}
            label={t("sendNow")}
            title={t("sendTitle", { subject: campaign.subject })}
            points={[
              t("sendWho", {
                count: list?.subscriptions.confirmed ?? 0,
                list: listName,
              }),
              t("sendRate"),
              campaign.advertising ? t("sendAds", { label: ads.label }) : t("sendFooter"),
              t("sendNoUndo"),
            ]}
            submit={t("sendSubmit")}
            done={t("sendDone")}
            danger={false}
            small={false}
          />
        ) : null}
        {sender && allowed.includes("pause") ? (
          <ChangeButtons
            action={pauseOrResume}
            id={id}
            expect={campaign.updated_at}
            undo={undo}
            small={false}
            moves={[{ value: "paused", label: t("pause"), done: t("paused") }]}
          />
        ) : null}
        {sender && allowed.includes("resume") ? (
          <ChangeButtons
            action={pauseOrResume}
            id={id}
            expect={campaign.updated_at}
            undo={undo}
            small={false}
            moves={[{ value: "sending", label: t("resume"), done: t("resumed"), tone: "pri" }]}
          />
        ) : null}
        {sender && allowed.includes("cancel") ? (
          <ConfirmButton
            action={cancelCampaign}
            fields={version}
            label={t("cancel")}
            title={t("cancelTitle")}
            points={[t("cancelSkipped", { count: p.pending }), t("cancelNoUndo")]}
            submit={t("cancelSubmit")}
            done={t("cancelled")}
            small={false}
          />
        ) : null}
        {manage && allowed.includes("delete") ? (
          <ConfirmButton
            action={deleteCampaign}
            fields={version}
            label={t("delete")}
            title={t("deleteTitle")}
            points={[t("deleteGone"), t("deleteNoUndo")]}
            submit={t("deleteSubmit")}
            small={false}
          />
        ) : null}
      </div>

      <div className="blocks">
        <section className="block" aria-labelledby="prog-h">
          <div className="block-head">
            <h2 id="prog-h" className="h2">
              {t("progress")}
            </h2>
            {campaign.status === "sending" ? (
              <Link className="btn sm" href={`/marketing/newsletter/campaigns/${id}`}>
                {t("refresh")}
              </Link>
            ) : null}
          </div>
          <div className="kpis">
            {(
              [
                ["total", p.total],
                ["sent", p.sent],
                ["failed", p.failed],
                ["skipped", p.skipped],
                ["bounced", p.bounced],
                ["unsubscribed", p.unsubscribed],
                ["pending", p.pending],
              ] as const
            ).map(([key, value]) => (
              <div key={key} className="card kpi">
                <span className="kpi-label">{t(`kpi.${key}`)}</span>
                <span className="kpi-value tabular-nums">{count(value, locale)}</span>
                <span className="kpi-sub">{t(`kpiAbout.${key}`)}</span>
              </div>
            ))}
          </div>
          {p.total > 0 ? (
            <div className="card padded meters">
              <div className="meter">
                <div className="meter-head">
                  <span>{t("handled")}</span>
                  <b className="tabular-nums">{pct}%</b>
                </div>
                <span
                  className="eg-bar"
                  role="progressbar"
                  aria-valuenow={pct}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={t("handled")}
                >
                  <span style={{ width: `${pct}%` }} />
                </span>
              </div>
            </div>
          ) : null}
          <Facts
            items={[
              [t("listLabel"), listName],
              [t("localeLabel"), t(`locales.${campaign.locale}`)],
              [
                t("scheduledLabel"),
                campaign.scheduled_at ? <Time key="s" value={campaign.scheduled_at} /> : "—",
              ],
              [
                t("startedLabel"),
                campaign.started_at ? <Time key="st" value={campaign.started_at} /> : "—",
              ],
              [
                t("finishedLabel"),
                campaign.finished_at ? <Time key="f" value={campaign.finished_at} /> : "—",
              ],
              [
                t("sourceLabel"),
                campaign.source
                  ? `${campaign.source} · ${campaign.source_ref ?? ""}`
                  : t("sourceManual"),
              ],
            ]}
          />
        </section>

        <section className="block" aria-labelledby="body-h">
          <h2 id="body-h" className="h2">
            {editable ? t("editContent") : t("content")}
          </h2>
          {campaign.status === "scheduled" && editable ? (
            <p className="note warn">{t("editScheduled")}</p>
          ) : null}
          {editable ? (
            <CampaignEditor
              action={updateCampaign}
              submit={t("editor.save")}
              lists={lists.map((l) => ({
                id: l.id,
                name: pickText(l.name, locale) || l.key,
                confirmed: l.subscriptions.confirmed,
              }))}
              initial={{
                id: campaign.id,
                expect: campaign.updated_at,
                listId: campaign.list_id,
                subject: campaign.subject,
                preheader: campaign.preheader ?? "",
                locale: campaign.locale,
                advertising: campaign.advertising,
                bodyText: campaign.body_text,
                bodyHtml: campaign.body_html ?? "",
              }}
              ads={ads}
            />
          ) : (
            <div className="card padded eg-stack">
              <Facts items={[[t("preheaderLabel"), campaign.preheader || "—"]]} />
              <pre className="eg-text">{campaign.body_text}</pre>
            </div>
          )}
        </section>

        <section className="block" aria-labelledby="sent-h">
          <h2 id="sent-h" className="h2">
            {t("asSent")}
          </h2>
          <p className="fhint">{t("asSentAbout")}</p>
          {preview.ok ? (
            <div className="card padded eg-stack" data-testid="campaign-preview">
              <Facts items={[[t("subjectAsSent"), preview.data.data.subject]]} />
              {preview.data.data.body_html ? (
                <iframe
                  className="eg-frame"
                  sandbox=""
                  srcDoc={preview.data.data.body_html}
                  title={t("htmlPreview")}
                />
              ) : null}
              <details>
                <summary>{t("textVersion")}</summary>
                <pre className="eg-text">{preview.data.data.body_text}</pre>
              </details>
            </div>
          ) : (
            <p className="note warn" data-code={preview.problem.code}>
              {t("previewUnavailable")} {preview.problem.detail}
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
