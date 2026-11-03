"use client";

import { useApi } from "@/src/hooks/use-api";
import { useI18n } from "@/src/i18n/provider";
import { getCategory, listStreams } from "@/src/lib/api/catalog";
import { EmptyState, ErrorState, LoadingState } from "./DataStates";
import { NotFoundView } from "./NotFoundView";
import { StreamCard } from "./StreamCard";

// Danh sách bàn tự làm mới ngầm mỗi 10 giây (streamer, bàn mới / bàn bị ẩn...).
const STREAMS_REFRESH_MS = 10_000;

export function CategoryStreamsView({ categoryId }: { categoryId: string }) {
  const { t } = useI18n();
  const category = useApi(() => getCategory(categoryId), [categoryId]);
  const streams = useApi(() => listStreams(categoryId), [categoryId], { refreshMs: STREAMS_REFRESH_MS });

  if (category.status === "loading") return <LoadingState />;
  if (category.status === "error") {
    return category.error.status === 404 || category.error.status === 400
      ? <NotFoundView />
      : <ErrorState error={category.error} onRetry={category.reload} />;
  }

  return (
    <>
      <div className="card card-glass page-head">
        <div>
          <h2 className="page-title">{category.data.name}</h2>
          <p className="hint">{t("streams.subtitle")}</p>
        </div>
        {streams.status === "success" && (
          <span className="chip chip-dark">{t("streams.liveBadge", { count: streams.data.length })}</span>
        )}
      </div>
      {streams.status === "loading" && <LoadingState />}
      {streams.status === "error" && <ErrorState error={streams.error} onRetry={streams.reload} />}
      {streams.status === "success" &&
        (streams.data.length === 0 ? (
          <EmptyState message={t("streams.empty")} />
        ) : (
          <div className="grid grid-3">
            {streams.data.map((stream) => (
              <StreamCard key={stream.id} stream={stream} />
            ))}
          </div>
        ))}
    </>
  );
}
