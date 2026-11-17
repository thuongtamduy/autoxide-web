import { getTranslations } from "next-intl/server";
import { LinkForms } from "./link-forms";

// `/sign-in/link`: xin link đăng nhập qua email; `/sign-in/link?token=…`: đích của link trong thư
// (biến `AUTOXIDE_AUTH_LOGIN_LINK_URL` của core). Máy chủ core cần bật `AUTOXIDE_AUTH_LOGIN_LINK`.
export default async function SignInLinkPage(props: PageProps<"/sign-in/link">) {
  await getTranslations("public.link");
  const { token } = await props.searchParams;
  return <LinkForms token={typeof token === "string" && token !== "" ? token : null} />;
}
