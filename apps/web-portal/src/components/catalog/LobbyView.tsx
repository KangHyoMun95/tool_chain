"use client";

import { useState } from "react";
import { NO_HU_LOBBY_ID, noHuGameName } from "@toolhackchain/shared";
import { useApi } from "@/src/hooks/use-api";
import { useI18n } from "@/src/i18n/provider";
import { listCategories, listLobbies } from "@/src/lib/api/catalog";
import { EmptyState, ErrorState } from "../DataStates";
import { NotFoundView } from "../NotFoundView";
import { CatalogCard } from "./CatalogCard";
import { HeroBanner } from "./HeroBanner";
import { NoticeTicker } from "./NoticeTicker";
import { CatalogGridSkeleton } from "./Skeletons";

/** Trang lobby: banner + thẻ các loại game (category) của lobby. */
export function LobbyView({ lobbyId }: { lobbyId: string }) {
  const { t, locale } = useI18n();
  const lobbies = useApi(listLobbies, []);
  const categories = useApi(() => listCategories(lobbyId), [lobbyId]);
  const [clicked, setClicked] = useState<string | null>(null);

  // Lobby không có trong danh sách (không tồn tại hoặc không thuộc phạm vi nhìn thấy) ⇒ 404.
  const missing = lobbies.status === "success" && !lobbies.data.some((l) => l.id === lobbyId);

  return (
    <>
      {missing ? (
        <NotFoundView />
      ) : (
        <>
          <HeroBanner />
          {categories.status === "loading" && <CatalogGridSkeleton />}
          {categories.status === "error" && <ErrorState error={categories.error} onRetry={categories.reload} />}
          {categories.status === "success" &&
            (categories.data.length === 0 ? (
              <EmptyState message={t("categories.empty")} />
            ) : (
              <section className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
                {categories.data.map((category, i) => (
                  <CatalogCard
                    key={category.id}
                    kind="categories"
                    name={category.name}
                    displayName={lobbyId === NO_HU_LOBBY_ID ? noHuGameName(category.name, locale) : undefined}
                    // Lobby NỔ HŨ không có bàn: vào thẳng trang chi tiết riêng, không hiện số bàn.
                    subtitle={lobbyId === NO_HU_LOBBY_ID ? t("categories.noHuSubtitle") : t("categories.tableCount", { count: category.streamCount })}
                    href={lobbyId === NO_HU_LOBBY_ID ? `/no-hu/${category.id}` : `/categories/${category.id}`}
                    index={i}
                    total={categories.data.length}
                    clicked={clicked === category.id}
                    onClick={() => setClicked(category.id)}
                  />
                ))}
              </section>
            ))}
          <NoticeTicker />
        </>
      )}
    </>
  );
}
