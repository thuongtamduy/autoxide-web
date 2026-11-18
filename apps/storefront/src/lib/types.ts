// Tên ngắn cho các kiểu của core mà website dùng (sinh từ `openapi.json`, gói `@autoxide/sdk`).
import type { components } from "@autoxide/sdk";

type Schemas = components["schemas"];

export type PublicEntry = Schemas["PublicEntryResponse"];
export type PublicMedia = Schemas["PublicMedia"];
export type PublicTerm = Schemas["PublicTerm"];
export type PublicTermCount = Schemas["PublicTermCount"];
export type PublicAuthor = Schemas["PublicAuthor"];
export type PublicTranslation = Schemas["PublicTranslation"];
export type BodyNode = Schemas["BodyNode"];
export type BodyMark = Schemas["BodyMark"];
export type SiteMenuItem = Schemas["PublicSiteMenuItem"];
export type SiteMenu = Schemas["Data_PublicSiteMenu"]["data"];
export type TermPage = Schemas["Data_PublicTermPage"]["data"];
export type AuthorPage = Schemas["Data_PublicAuthorPage"]["data"];
export type SearchHit = Schemas["Page_SearchHit"]["data"][number];
export type SitemapItem = Schemas["Page_SitemapItem"]["data"][number];
export type Resolution = Schemas["Data_Resolution"]["data"];
export type PreviewEntry = Schemas["Data_PreviewEntryResponse"]["data"];
export type ThreadComment = Schemas["Page_ThreadComment"]["data"][number];
export type PublicComment = Schemas["PublicComment"];
export type CommentSettings = Schemas["Data_CommentSettings"]["data"];
export type NewsletterLists = Schemas["Data_PublicListsResponse"]["data"];
export type Preferences = Schemas["Data_PreferencesResponse"]["data"];
export type Pagination = Schemas["Pagination"];
export type PublicOwner = Schemas["CompliancePublicOwner"];
export type PublicBadge = Schemas["ComplianceBadge"];
