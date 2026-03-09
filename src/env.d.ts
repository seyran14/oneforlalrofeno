/// <reference path="../.astro/types.d.ts" />
/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly NOTION_TOKEN: string;
  readonly NOTION_POSTS_DB: string;
  readonly NOTION_THOUGHTS_DB: string;
  readonly NOTION_MEDIA_DB: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
