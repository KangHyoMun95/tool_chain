"use client";

import { useEffect, useMemo, useState } from "react";
import { useApi } from "@/src/hooks/use-api";
import { useI18n } from "@/src/i18n/provider";
import { getCategory, listStreams } from "@/src/lib/api/catalog";
import { getMe } from "@/src/lib/api/me";
import { fetchCategoryStreamStats } from "@/src/lib/api/predictions";
import { INSUFFICIENT_NOTICE } from "@/src/lib/notice";
import { PageBanner } from "./catalog/PageBanner";
import { PageBannerSkeleton, StreamGridSkeleton } from "./catalog/Skeletons";
import { StreamCard } from "./catalog/StreamCard";
import { EmptyState, ErrorState, NoticeBanner } from "./DataStates";
import { NotFoundView } from "./NotFoundView";
import { AppShell } from "./shell/AppShell";

export function CategoryStreamsView({ categoryId }: { categoryId: string }) {
  const { t } = useI18n();
  const category = useApi(() => getCategory(categoryId), [categoryId]);
  const streams = useApi(() => listStreams(categoryId), [categoryId]);
  const stats = useApi(() => fetchCategoryStreamStats(categoryId), [categoryId]);
  const me = useApi(getMe, []);
  // Chưa tải xong /me thì không khóa (API vẫn chặn 402 ở trang chi tiết).
  const canParticipate = me.status === "success" ? me.data.canParticipate : true;

  // ?notice=insufficient_balance: vừa bị đưa về từ trang chi tiết vì hết điểm. Đọc một lần rồi bỏ khỏi URL.
  const [notice, setNotice] = useState(false);
  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get("notice") !== INSUFFICIENT_NOTICE) return;
    setNotice(true);
    url.searchParams.delete("notice");
    window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
  }, []);

  // Xếp theo tỷ lệ win của shoe hiện tại, cao → thấp; bàn chưa có tỷ lệ xuống cuối; hòa thì nhiều ván hơn trước, rồi theo tên.
  const sorted = useMemo(() => {
    if (streams.status !== "success") return [];
    const byId = new Map(stats.status === "success" ? stats.data.map((s) => [s.stream_id, s]) : []);
    return streams.data
      .map((stream) => ({ stream, stats: byId.get(stream.id) }))
      .sort((a, b) => {
        const ra = a.stats?.win_rate ?? -1, rb = b.stats?.win_rate ?? -1;
        if (ra !== rb) return rb - ra;
        const na = (a.stats?.wins ?? 0) + (a.stats?.losses ?? 0), nb = (b.stats?.wins ?? 0) + (b.stats?.losses ?? 0);
        if (na !== nb) return nb - na;
        return a.stream.name.localeCompare(b.stream.name);
      });
  }, [streams, stats]);

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
        {notice && <NoticeBanner message={t("billing.kickedOut")} onClose={() => setNotice(false)} />}
        {(streams.status === "loading" || (streams.status === "success" && stats.status === "loading")) && <StreamGridSkeleton />}
        {streams.status === "error" && <ErrorState error={streams.error} onRetry={streams.reload} />}
        {streams.status === "success" && stats.status !== "loading" &&
          (streams.data.length === 0 ? (
            <EmptyState message={t("streams.empty")} />
          ) : (
            <section className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {sorted.map(({ stream, stats: s }, i) => (
                <StreamCard key={stream.id} stream={stream} stats={s} index={i} canParticipate={canParticipate} />
              ))}
            </section>
          ))}
      </>
    );
  }

  return <AppShell>{body}</AppShell>;
}
