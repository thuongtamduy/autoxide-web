import { createNavigation } from "next-intl/navigation";
import { routing } from "./routing";

// `Link`, `redirect`… tự thêm tiền tố ngôn ngữ (`/en/…`) cho đường dẫn trong website.
export const { Link, redirect, permanentRedirect, usePathname, useRouter, getPathname } =
  createNavigation(routing);
