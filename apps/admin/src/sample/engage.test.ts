import { afterEach, describe, expect, it } from "vitest";
import { getCommentPolicy, resetSampleEngage, updateCommentPolicy } from "./engage";

afterEach(resetSampleEngage);

describe("cài đặt bình luận theo khách (mẫu)", () => {
  it("mặc định như core: khách duyệt trước, người dùng duyệt lần đầu, không đòi xác thực", async () => {
    const { data } = await getCommentPolicy();
    expect(data).toMatchObject({
      guests_allowed: true,
      guest_moderation: "pre",
      user_moderation: "first_time",
      posting: "none",
    });
  });

  it("đòi xác thực tài khoản mà vẫn cho khách thì báo lỗi ở ô khách", async () => {
    const result = await updateCommentPolicy({
      guests_allowed: true,
      guest_moderation: "pre",
      user_moderation: "post",
      posting: "phone",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.problem.errors?.map((e) => [e.field, e.code])).toEqual([
      ["guests_allowed", "guests_need_none"],
    ]);
    expect((await getCommentPolicy()).data.posting).toBe("none");
  });

  it("lưu được khi hợp lệ; khởi động lại thì về ban đầu", async () => {
    const result = await updateCommentPolicy({
      guests_allowed: false,
      guest_moderation: "pre",
      user_moderation: "post",
      posting: "identity",
    });
    expect(result.ok).toBe(true);
    expect((await getCommentPolicy()).data.posting).toBe("identity");
    resetSampleEngage();
    expect((await getCommentPolicy()).data.posting).toBe("none");
  });
});
