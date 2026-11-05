"use client";

import { useState } from "react";
import { useApi } from "@/src/hooks/use-api";
import { useI18n } from "@/src/i18n/provider";
import { listCategories, listLobbies } from "@/src/lib/api/catalog";
import { EmptyState, ErrorState, LoadingState } from "../DataStates";
import { NotFoundView } from "../NotFoundView";
import { AppShell } from "../shell/AppShell";
import { CatalogCard } from "./CatalogCard";
import { HeroBanner } from "./HeroBanner";
import { NoticeTicker } from "./NoticeTicker";

/** Trang lobby: banner + thẻ các loại game (category) của lobby. */
export function LobbyView({ lobbyId }: { lobbyId: string }) {
  const { t } = useI18n();
  const lobbies = useApi(listLobbies, []);
  const categories = useApi(() => listCategories(lobbyId), [lobbyId]);
  const [clicked, setClicked] = useState<string | null>(null);

  // Lobby không có trong danh sách (không tồn tại hoặc không thuộc phạm vi nhìn thấy) ⇒ 404.
  const missing = lobbies.status === "success" && !lobbies.data.some((l) => l.id === lobbyId);

  return (
    <AppShell sidebar activeLobbyId={lobbyId}>
      {missing ? (
        <NotFoundView />
      ) : (
        <>
          <HeroBanner />
          {categories.status === "loading" && <LoadingState />}
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
                    subtitle={t("categories.tableCount", { count: category.streamCount })}
                    href={`/categories/${category.id}`}
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
    </AppShell>
  );
}
