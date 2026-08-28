import type { Json } from "@/lib/db/types";

export type NotionSourceDefaults = {
  database_url: string;
  content_mode: "property" | "page_body";
  content_property: string;
  student_property: string;
  topic_property: string;
};

const EMPTY_DEFAULTS: NotionSourceDefaults = {
  database_url: "",
  content_mode: "property",
  content_property: "",
  student_property: "",
  topic_property: "",
};

export function readNotionSourceDefaults(value: Json): NotionSourceDefaults {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return EMPTY_DEFAULTS;
  }

  const record = value as Record<string, Json | undefined>;
  const read = (key: keyof NotionSourceDefaults) => {
    const stored = record[key];
    return typeof stored === "string" ? stored : "";
  };
  const contentMode = read("content_mode");

  return {
    database_url: read("database_url"),
    content_mode: contentMode === "page_body" ? "page_body" : "property",
    content_property: read("content_property"),
    student_property: read("student_property"),
    topic_property: read("topic_property"),
  };
}
