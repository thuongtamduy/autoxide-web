"use server";

// Server Action của phân hệ Tuân thủ (dữ liệu mẫu, W-006, W-012): gọi hàm mẫu của
// `src/sample/compliance*.ts` thay cho API của bước 37 của core, cùng cách trả lỗi (Problem → lỗi
// theo ô) như phần gọi core thật, để khi có API chỉ thay lời gọi. Riêng danh sách trang nguồn của
// văn bản pháp lý đọc từ core thật (`GET /api/v1/content/entries`).
import { refresh } from "next/cache";
import { getTranslations } from "next-intl/server";
import type { DialogState } from "@/components/ui/form-dialog";
import { loadPublishedPages } from "@/lib/compliance-server";
import type { ChangeState } from "@/lib/engage";
import { type FormState, nextDone } from "@/lib/form";
import {
  finishSample,
  type SampleOutcome,
  sampleGuard,
  translateSample,
} from "@/lib/sample-action";
import { type BulkInput, type BulkResult, bulkBlocked, cleanIds, eachId } from "@/lib/table";
import { getMe } from "@/lib/viewer";
import {
  advanceIncident,
  approveKyc,
  openIncident,
  recordDecision,
  recordSubmission,
  rejectKyc,
  updateLegalProfile,
  updatePolicies,
} from "@/sample/compliance";
import {
  createPurpose,
  createSubjectRequest,
  decideCase,
  moveSubjectRequest,
  notifyRespondent,
  publishVersion,
  restoreCase,
  restrictCase,
  setAiLabel,
  setPurposeActive,
} from "@/sample/compliance-records";

function text(formData: FormData, name: string): string {
  return String(formData.get(name) ?? "");
}

/** Giá trị vừa gửi để điền lại khi báo lỗi; ô nhiều lựa chọn nối bằng dấu phẩy. */
function values(formData: FormData, names: readonly string[]): Record<string, string> {
  return Object.fromEntries(
    names.map((name) => [name, formData.getAll(name).map(String).join(",")]),
  );
}

async function finish<T>(
  state: FormState,
  outcome: SampleOutcome<T>,
  fields: readonly string[],
  sent: Record<string, string> = {},
): Promise<DialogState> {
  return finishSample(state, outcome, fields, sent);
}

/** Kết quả của thao tác đảo được thành trạng thái cho `ChangeButtons` (kèm trạng thái cũ). */
async function change<T>(
  state: ChangeState,
  outcome: SampleOutcome<T>,
  previous: (data: T) => string,
): Promise<ChangeState> {
  const next = await finishSample(state, outcome, []);
  if (!outcome.ok) return next;
  return { ...next, done: nextDone(state), previous: previous(outcome.data), updated: "-" };
}

// ---------------------------------------------------------------- Website, hồ sơ Bộ Công Thương

export async function submitDossier(state: DialogState, formData: FormData): Promise<DialogState> {
  const off = await sampleGuard();
  if (off) return off;
  const fields = ["reference", "submitted_on", "acknowledged"];
  const sent = values(formData, fields);
  const outcome = await recordSubmission(text(formData, "website_id"), {
    reference: sent.reference ?? "",
    submitted_on: sent.submitted_on ?? "",
    acknowledged: sent.acknowledged === "on",
  });
  return finish(state, outcome, fields, sent);
}

export async function decideDossier(state: DialogState, formData: FormData): Promise<DialogState> {
  const off = await sampleGuard();
  if (off) return off;
  const fields = ["status", "link_url", "image_url"];
  const sent = values(formData, fields);
  const outcome = await recordDecision(text(formData, "website_id"), {
    status: sent.status ?? "",
    link_url: sent.link_url ?? "",
    image_url: sent.image_url ?? "",
  });
  return finish(state, outcome, fields, sent);
}

// ---------------------------------------------------------------- KYC

export async function approveKycAction(state: FormState, formData: FormData): Promise<FormState> {
  const off = await sampleGuard();
  if (off) return off;
  return finish(state, await approveKyc(text(formData, "id")), []);
}

/**
 * Chạy một hàm mẫu cho từng id đã chọn (thanh hàng loạt; hàm mẫu chỉ có lệnh từng cái), gom lỗi theo
 * dòng bằng câu đã dịch.
 */
async function bulkSample<T>(
  input: BulkInput,
  run: (id: string) => Promise<SampleOutcome<T>>,
): Promise<BulkResult> {
  const ids = cleanIds(input.ids);
  const off = await sampleGuard();
  if (off) return bulkBlocked(ids, off.error ?? "");
  const result = await eachId(ids, async (id) => {
    const outcome = await run(id);
    return outcome.ok ? null : (await translateSample(outcome.problem)).detail;
  });
  refresh();
  return result;
}

/** Duyệt nhiều hồ sơ KYC đang chờ (thanh hàng loạt); hồ sơ không ở trạng thái chờ thì báo lỗi. */
export async function bulkApproveKycAction(input: BulkInput): Promise<BulkResult> {
  return bulkSample(input, approveKyc);
}

export async function rejectKycAction(
  state: DialogState,
  formData: FormData,
): Promise<DialogState> {
  const off = await sampleGuard();
  if (off) return off;
  const fields = ["reason_code", "note"];
  const sent = values(formData, fields);
  const outcome = await rejectKyc(text(formData, "id"), {
    reason_code: sent.reason_code ?? "",
    note: sent.note ?? "",
  });
  return finish(state, outcome, fields, sent);
}

// ---------------------------------------------------------------- Sự cố

export async function openIncidentAction(
  state: DialogState,
  formData: FormData,
): Promise<DialogState> {
  const off = await sampleGuard();
  if (off) return off;
  const fields = ["data_categories", "description", "severity", "affected_count"];
  const sent = values(formData, fields);
  const outcome = await openIncident({
    data_categories: formData.getAll("data_categories").map(String),
    description: sent.description ?? "",
    severity: sent.severity ?? "",
    affected_count: sent.affected_count ?? "",
  });
  return finish(state, outcome, fields, sent);
}

export async function incidentStep(state: DialogState, formData: FormData): Promise<DialogState> {
  const off = await sampleGuard();
  if (off) return off;
  const sent = values(formData, ["authority_reference"]);
  const outcome = await advanceIncident(
    text(formData, "id"),
    text(formData, "step"),
    sent.authority_reference ?? "",
  );
  return finish(state, outcome, ["authority_reference"], sent);
}

// ---------------------------------------------------------------- Hồ sơ pháp lý, chính sách

const PROFILE_FIELDS = [
  "entity_type",
  "legal_name",
  "trade_name",
  "tax_code",
  "registration_number",
  "representative_name",
  "representative_title",
  "province_code",
  "commune_name",
  "line",
  "phone",
  "email",
] as const;

export async function saveLegalProfile(state: FormState, formData: FormData): Promise<FormState> {
  const off = await sampleGuard();
  if (off) return off;
  const sent = values(formData, PROFILE_FIELDS);
  const input = Object.fromEntries(PROFILE_FIELDS.map((f) => [f, sent[f] ?? ""])) as Record<
    (typeof PROFILE_FIELDS)[number],
    string
  >;
  const outcome = await updateLegalProfile(text(formData, "id"), {
    ...input,
    entity_type: input.entity_type as "company",
  });
  return finish(state, outcome, PROFILE_FIELDS, sent);
}

/** Lưu một nhóm chính sách (kênh liên hệ, hoặc xác thực người đăng nội dung). */
export async function savePolicies(state: FormState, formData: FormData): Promise<FormState> {
  const off = await sampleGuard();
  if (off) return off;
  const names = [
    "complaints.contact",
    "privacy.contact",
    "posting.reviews",
    "posting.livestream",
    "posting.max_accounts_per_phone",
  ].filter((name) => formData.has(name));
  const sent = values(formData, names);
  return finish(state, await updatePolicies(sent), names, sent);
}

// ---------------------------------------------------------------- Mục đích

export async function addPurpose(state: DialogState, formData: FormData): Promise<DialogState> {
  const off = await sampleGuard();
  if (off) return off;
  const fields = [
    "key",
    "description_en",
    "description_vi",
    "legal_basis",
    "retention",
    "data_categories",
  ];
  const sent = values(formData, fields);
  const outcome = await createPurpose({
    key: sent.key ?? "",
    description_en: sent.description_en ?? "",
    description_vi: sent.description_vi ?? "",
    legal_basis: sent.legal_basis ?? "",
    retention: sent.retention ?? "",
    data_categories: formData.getAll("data_categories").map(String),
  });
  return finish(state, outcome, fields, sent);
}

/** Bật / tắt một mục đích (`status` = `on` / `off`). Đảo được: Hoàn tác gửi lại trạng thái cũ. */
export async function togglePurpose(state: ChangeState, formData: FormData): Promise<ChangeState> {
  const off = await sampleGuard();
  if (off) return off;
  const outcome = await setPurposeActive(text(formData, "id"), text(formData, "status") === "on");
  return change(state, outcome, (p) => (p.previous ? "on" : "off"));
}

// ---------------------------------------------------------------- Văn bản

/**
 * Phát hành bản mới. Trang nguồn phải là trang đã đăng của `content`: đọc danh sách thật từ core
 * ngay lúc gửi (không tin danh sách trình duyệt gửi lên).
 */
export async function publishDocument(
  state: DialogState,
  formData: FormData,
): Promise<DialogState> {
  const off = await sampleGuard();
  if (off) return off;
  const fields = [
    "source_entry_id",
    "locale",
    "effective_from",
    "acknowledged",
    "requires_reacceptance",
  ];
  const sent = values(formData, fields);
  // Không đọc được (thiếu module `content` hay permission): mọi trang nguồn đều bị từ chối.
  const published = (await loadPublishedPages()) ?? [];
  const source = published.find((p) => p.id === sent.source_entry_id);
  const outcome = await publishVersion(text(formData, "document_id"), {
    source_entry_id: sent.source_entry_id ?? "",
    source_title: source?.title ?? "",
    published: published.map((p) => p.id),
    locale: sent.locale ?? "",
    effective_from: sent.effective_from ?? "",
    requires_reacceptance: sent.requires_reacceptance === "on",
    acknowledged: sent.acknowledged === "on",
  });
  return finish(state, outcome, fields, sent);
}

// ---------------------------------------------------------------- Vụ việc

/**
 * Ẩn tạm đích (`status=restrict`) hay hiện lại (`status=restore:<trạng thái cũ>`). Đảo được: Hoàn
 * tác của "ẩn tạm" hiện lại đích và trả vụ việc về trạng thái trước.
 */
export async function restrictTarget(state: ChangeState, formData: FormData): Promise<ChangeState> {
  const off = await sampleGuard();
  if (off) return off;
  const id = text(formData, "id");
  const status = text(formData, "status");
  if (status === "restrict") {
    return change(state, await restrictCase(id), (c) => `restore:${c.previous}`);
  }
  const back = status.startsWith("restore:") ? status.slice("restore:".length) : "";
  return change(
    state,
    await restoreCase(id, (back || undefined) as "received" | undefined),
    () => "restrict",
  );
}

export async function notifyCaseRespondent(
  state: FormState,
  formData: FormData,
): Promise<FormState> {
  const off = await sampleGuard();
  if (off) return off;
  return finish(state, await notifyRespondent(text(formData, "id")), []);
}

export async function decideCaseAction(
  state: DialogState,
  formData: FormData,
): Promise<DialogState> {
  const off = await sampleGuard();
  if (off) return off;
  const fields = ["decision", "reason"];
  const sent = values(formData, fields);
  const outcome = await decideCase(text(formData, "id"), {
    decision: sent.decision ?? "",
    reason: sent.reason ?? "",
  });
  return finish(state, outcome, fields, sent);
}

// ---------------------------------------------------------------- Nhãn AI

export async function aiLabel(state: ChangeState, formData: FormData): Promise<ChangeState> {
  const off = await sampleGuard();
  if (off) return off;
  const label = text(formData, "status") === "removed" ? "removed" : "ai_assisted";
  return change(state, await setAiLabel(text(formData, "id"), label), (a) => a.previous);
}

// ---------------------------------------------------------------- Yêu cầu của chủ thể dữ liệu

export async function addSubjectRequest(
  state: DialogState,
  formData: FormData,
): Promise<DialogState> {
  const off = await sampleGuard();
  if (off) return off;
  const fields = ["kind", "channel", "subject", "note"];
  const sent = values(formData, fields);
  const me = await getMe();
  const outcome = await createSubjectRequest(
    {
      kind: sent.kind ?? "",
      channel: sent.channel ?? "",
      subject: sent.subject ?? "",
      note: sent.note ?? "",
    },
    me.name || me.email,
  );
  return finish(state, outcome, fields, sent);
}

/** Chuyển trạng thái một yêu cầu; từ chối cần lý do (ô `reason`). */
export async function moveRequest(state: DialogState, formData: FormData): Promise<DialogState> {
  const off = await sampleGuard();
  if (off) return off;
  const sent = values(formData, ["reason"]);
  const status = text(formData, "status");
  if (!status) {
    const t = await getTranslations("compliance");
    return { error: t("badRequest") };
  }
  const outcome = await moveSubjectRequest(text(formData, "id"), status, sent.reason ?? "");
  return finish(state, outcome, ["reason"], sent);
}

/** Chuyển nhiều yêu cầu chủ thể sang "đang xử lý" (đã xác minh người yêu cầu). */
export async function bulkVerifyRequestsAction(input: BulkInput): Promise<BulkResult> {
  return bulkSample(input, (id) => moveSubjectRequest(id, "in_progress"));
}

/** Đánh dấu nhiều yêu cầu chủ thể đang xử lý là đã xong. */
export async function bulkFinishRequestsAction(input: BulkInput): Promise<BulkResult> {
  return bulkSample(input, (id) => moveSubjectRequest(id, "done"));
}
