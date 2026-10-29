"use client";

import { useI18n } from "@/src/i18n/provider";
import type { Category, Stream } from "@/src/lib/portal-data";
import { StreamCard } from "./StreamCard";

export function CategoryStreamsView({
  category,
  streams,
}: {
  category: Category;
  streams: Stream[];
}) {
  const { t } = useI18n();

  return (
    <>
      <div className="card card-glass page-head">
        <div>
          <h2 className="page-title">{category.name}</h2>
          <p className="hint">{t("streams.subtitle")}</p>
        </div>
        <span className="chip chip-dark">{t("streams.liveBadge", { count: streams.length })}</span>
      </div>
      <div className="grid grid-3">
        {streams.map((stream) => (
          <StreamCard key={stream.id} stream={stream} />
        ))}
      </div>
    </>
  );
}
