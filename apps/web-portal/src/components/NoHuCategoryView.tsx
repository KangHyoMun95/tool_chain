"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { NO_HU_LOBBY_ID } from "@toolhackchain/shared";
import { useApi } from "@/src/hooks/use-api";
import { useI18n } from "@/src/i18n/provider";
import { getCategory } from "@/src/lib/api/catalog";
import { PageBanner } from "./catalog/PageBanner";
import { PageBannerSkeleton } from "./catalog/Skeletons";
import { ErrorState } from "./DataStates";
import { NotFoundView } from "./NotFoundView";
import { AppShell } from "./shell/AppShell";
import { HudCard } from "./ui/HudCard";

/**
 * Trang chi tiết riêng của lobby NỔ HŨ (không có danh sách stream): category → thẳng vào đây.
 * Nhận diện bằng NO_HU_LOBBY_ID (không so tên). Phần nội dung là placeholder, thiết kế sau.
 */
export function NoHuCategoryView({ categoryId }: { categoryId: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const category = useApi(() => getCategory(categoryId), [categoryId]);

  // Category của lobby khác không có trang này: đưa về trang danh sách bàn như cũ.
  const otherLobby = category.status === "success" && category.data.lobbyId !== NO_HU_LOBBY_ID;
  useEffect(() => {
    if (otherLobby) router.replace(`/categories/${categoryId}`);
  }, [otherLobby, categoryId, router]);

  let body;
  if (category.status === "loading" || otherLobby) body = <PageBannerSkeleton />;
  else if (category.status === "error") {
    body = category.error.status === 404 || category.error.status === 400
      ? <NotFoundView />
      : <ErrorState error={category.error} onRetry={category.reload} />;
  } else {
    body = (
      <>
        <PageBanner title={category.data.name} backHref={`/lobbies/${category.data.lobbyId}`} />
        {/* TODO(no-hu): nội dung trang chi tiết (lịch lucky time) — thiết kế sau. */}
        <HudCard className="mt-4 p-6 text-sm text-gray-300">{t("noHu.placeholder")}</HudCard>
      </>
    );
  }

  return <AppShell>{body}</AppShell>;
}
