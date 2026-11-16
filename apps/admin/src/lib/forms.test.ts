import { describe, expect, it } from "vitest";
import {
  answerText,
  emptyField,
  type FormField,
  fieldErrors,
  fieldFromCore,
  fieldToCore,
  parseOptions,
  retention,
  type Submission,
  submissionMoves,
  submissionSummary,
  suggestFormKey,
  suggestKey,
} from "./forms";

describe("trường của form: trình sửa ↔ core", () => {
  it("chỉ gửi thuộc tính hợp với kiểu", () => {
    const text = fieldToCore({
      ...emptyField("text"),
      key: " name ",
      labelVi: "Họ tên",
      required: true,
      maxLength: "120",
      min: "5",
      options: "a",
    });
    expect(text).toEqual({
      key: "name",
      type: "text",
      label: { vi: "Họ tên" },
      required: true,
      max_length: 120,
    });

    const number = fieldToCore({
      ...emptyField("number"),
      key: "qty",
      labelEn: "Qty",
      min: "1",
      max: "2,5",
      maxLength: "9",
    });
    expect(number).toMatchObject({ min: 1, max: 2.5 });
    expect(number.max_length).toBeUndefined();

    const consent = fieldToCore({
      ...emptyField("consent"),
      key: "agree",
      labelVi: "Đồng ý",
      placeholderVi: "x",
    });
    expect(consent.placeholder).toBeUndefined();
  });

  it("lựa chọn: giá trị | nhãn tiếng Việt | nhãn tiếng Anh, dòng trống bỏ qua", () => {
    expect(parseOptions("hop-tac | Hợp tác | Partnership\n\nkhac\nbh | Bảo hành")).toEqual([
      { value: "hop-tac", label: { vi: "Hợp tác", en: "Partnership" } },
      { value: "khac" },
      { value: "bh", label: { vi: "Bảo hành" } },
    ]);
  });

  it("đi một vòng core → trình sửa → core không mất gì", () => {
    const field: FormField = {
      key: "topic",
      type: "select",
      label: { vi: "Chủ đề", en: "Topic" },
      help: { vi: "Chọn một" },
      required: true,
      options: [{ value: "a", label: { vi: "A", en: "A en" } }, { value: "b" }],
    };
    expect(fieldToCore(fieldFromCore(field))).toEqual(field);
  });

  it("gợi ý khoá và mã theo luật của core", () => {
    expect(suggestKey("Họ và tên")).toBe("ho_va_ten");
    expect(suggestKey("2 lựa chọn")).toBe("f_2_lua_chon");
    expect(suggestKey("")).toBe("");
    expect(suggestFormKey("Đăng ký lớp nấu ăn!")).toBe("dang-ky-lop-nau-an");
  });

  it("lỗi của core theo đường dẫn gắn vào đúng thẻ", () => {
    const errors = {
      "fields[0].key": "taken",
      "fields[2].options": "must have 1 to 100 options",
      "fields[2].options[1].value": "repeated",
      "fields[2].label.vi": "too long",
      "fields[2]": "unknown",
      name: "required",
    };
    expect(fieldErrors(errors, 2)).toEqual({
      options: "must have 1 to 100 options",
      label: "too long",
      _: "unknown",
    });
    expect(fieldErrors(errors, 1)).toEqual({});
  });
});

// `value` của core là chuỗi, số, mảng hay `true` tuỳ kiểu trường; kiểu sinh từ OpenAPI ghi là
// object, nên ép kiểu ở đây.
function answer(key: string, type: FormField["type"], vi: string, value: unknown) {
  return { key, type, label: { vi }, value: value as Submission["answers"][number]["value"] };
}

const SUB: Submission = {
  id: "s1",
  form_id: "f1",
  form_key: "lien-he",
  form_version: 1,
  status: "new",
  data: {},
  email: "duyen@example.com",
  created_at: "2026-11-13T03:12:00Z",
  updated_at: "2026-11-13T03:12:00Z",
  answers: [
    answer("name", "text", "Họ tên", "Phan Mỹ Duyên"),
    answer("email", "email", "Email", "duyen@example.com"),
    answer("topic", "select", "Chủ đề", "hop-tac"),
    answer("message", "textarea", "Nội dung", "Cần 40 bộ dao làm quà"),
    answer("agree", "consent", "Đồng ý", true),
  ],
};

describe("bài nộp", () => {
  it("tóm tắt: tên, email, câu trả lời dài nhất", () => {
    expect(submissionSummary(SUB)).toEqual({
      who: "Phan Mỹ Duyên",
      sub: "duyen@example.com",
      text: "Cần 40 bộ dao làm quà",
    });
    expect(submissionSummary({ ...SUB, answers: [] }).who).toBe("duyen@example.com");
    expect(submissionSummary({ ...SUB, email: null, answers: [] }).who).toBe("—");
  });

  it("câu trả lời: nhãn lựa chọn theo form hiện tại, đồng ý là Có", () => {
    const yesNo = { yes: "Có", no: "Không" };
    const topic: FormField = {
      key: "topic",
      type: "select",
      label: { vi: "Chủ đề" },
      options: [{ value: "hop-tac", label: { vi: "Hợp tác", en: "Partnership" } }],
    };
    const [, , choice, , agree] = SUB.answers;
    if (!choice || !agree) throw new Error("thiếu câu trả lời");
    expect(answerText(choice, yesNo, topic, "en")).toBe("Partnership");
    expect(answerText(choice, yesNo)).toBe("hop-tac");
    expect(answerText(agree, yesNo)).toBe("Có");
    expect(answerText(answer("topic", "checkbox", "Chủ đề", ["hop-tac", "x"]), yesNo, topic)).toBe(
      "Hợp tác, x",
    );
  });

  it("nhãn lựa chọn theo phiên bản lúc gửi (`choices` của core), không theo form hiện tại", () => {
    const yesNo = { yes: "Có", no: "Không" };
    const topic: FormField = {
      key: "topic",
      type: "radio",
      label: { vi: "Chủ đề" },
      options: [{ value: "hop-tac", label: { vi: "Nhãn mới" } }],
    };
    const sent = {
      ...answer("topic", "radio", "Chủ đề", "hop-tac"),
      choices: [{ value: "hop-tac", label: { vi: "Hợp tác" } }],
    };
    expect(answerText(sent, yesNo, topic)).toBe("Hợp tác");
    // Lựa chọn không còn trong phiên bản đó: core trả nhãn rỗng, hiện giá trị thô.
    const gone = {
      ...answer("topic", "checkbox", "Chủ đề", ["hop-tac", "cu"]),
      choices: [
        { value: "hop-tac", label: { vi: "Hợp tác" } },
        { value: "cu", label: {} },
      ],
    };
    expect(answerText(gone, yesNo, topic)).toBe("Hợp tác, cu");
  });

  it("trạng thái chuyển được và hạn lưu", () => {
    expect(submissionMoves("new")).toEqual(["read", "archived", "spam"]);
    expect(submissionMoves("spam")).toEqual(["new"]);
    const t = (key: string, values?: { days: number }) => `${key}${values ? values.days : ""}`;
    expect(retention(null, t)).toBe("retentionDefault");
    expect(retention(0, t)).toBe("retentionKeep");
    expect(retention(365, t)).toBe("retentionDays365");
  });
});
