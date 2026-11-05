"use client";

import { useApi } from "@/src/hooks/use-api";
import { useI18n } from "@/src/i18n/provider";
import { getCategory, listStreams } from "@/src/lib/api/catalog";
import { PageBanner } from "./catalog/PageBanner";
import { PageBannerSkeleton, StreamGridSkeleton } from "./catalog/Skeletons";
import { StreamCard } from "./catalog/StreamCard";
import { EmptyState, ErrorState } from "./DataStates";
import { NotFoundView } from "./NotFoundView";
import { AppShell } from "./shell/AppShell";

// Danh sách bàn tự làm mới ngầm mỗi 10 giây (streamer, bàn mới / bàn bị ẩn...).
const STREAMS_REFRESH_MS = 10_000;

export function CategoryStreamsView({ categoryId }: { categoryId: string }) {
  const { t } = useI18n();
  const category = useApi(() => getCategory(categoryId), [categoryId]);
  const streams = useApi(() => listStreams(categoryId), [categoryId], { refreshMs: STREAMS_REFRESH_MS });

  let body;
  if (category.status === "loading") body = <><PageBannerSkeleton /><StreamGridSkeleton /></>;
  else if (category.status === "error") {
    body = category.error.status === 404 || category.error.status === 400
      ? <NotFoundView />
      : <ErrorState error={category.error} onRetry={category.reload} />;
  } else {
    body = (
      <>
        {/* Quay lại trang lobby chứa category này */}
        <PageBanner title={category.data.name} backHref={`/lobbies/${category.data.lobbyId}`} />
        {streams.status === "loading" && <StreamGridSkeleton />}
        {streams.status === "error" && <ErrorState error={streams.error} onRetry={streams.reload} />}
        {streams.status === "success" &&
          (streams.data.length === 0 ? (
            <EmptyState message={t("streams.empty")} />
          ) : (
            <section className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {streams.data.map((stream, i) => (
                <StreamCard key={stream.id} stream={stream} index={i} />
              ))}
            </section>
          ))}
      </>
    );
  }

  return <AppShell>{body}</AppShell>;
}
