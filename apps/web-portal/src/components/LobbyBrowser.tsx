"use client";

import { useState } from "react";
import { useApi } from "@/src/hooks/use-api";
import { useI18n } from "@/src/i18n/provider";
import { listCategories, listLobbies } from "@/src/lib/api/catalog";
import { CategoryCard } from "./CategoryCard";
import { EmptyState, ErrorState, LoadingState } from "./DataStates";
import { LobbyCard } from "./LobbyCard";

export function LobbyBrowser() {
  const { t } = useI18n();
  const lobbies = useApi(listLobbies, []);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const list = lobbies.status === "success" ? lobbies.data : [];
  // Chưa chọn (hoặc sảnh đang chọn không còn) thì lấy sảnh đầu tiên.
  const active = list.find((l) => l.id === selectedId) ?? list[0];
  const categories = useApi(active ? () => listCategories(active.id) : null, [active?.id]);

  if (lobbies.status === "loading") return <LoadingState />;
  if (lobbies.status === "error") return <ErrorState error={lobbies.error} onRetry={lobbies.reload} />;
  if (list.length === 0) return <EmptyState message={t("lobbies.empty")} />;

  return (
    <div className="split">
      <section className="split-side stack-sm">
        <div className="section-head">
          <h2 className="section-title">{t("lobbies.title")}</h2>
          <span className="chip chip-dark">{t("lobbies.count", { count: list.length })}</span>
        </div>
        {list.map((lobby) => (
          <LobbyCard
            key={lobby.id}
            lobby={lobby}
            active={lobby.id === active?.id}
            onSelect={() => setSelectedId(lobby.id)}
          />
        ))}
      </section>

      <section className="split-main">
        <div className="section-head">
          <h2 className="section-title">{t("categories.title", { lobby: active?.name ?? "" })}</h2>
          <p className="hint">{t("categories.hint")}</p>
        </div>
        {categories.status === "loading" && <LoadingState />}
        {categories.status === "error" && <ErrorState error={categories.error} onRetry={categories.reload} />}
        {categories.status === "success" &&
          (categories.data.length === 0 ? (
            <EmptyState message={t("categories.empty")} />
          ) : (
            <div className="grid grid-2">
              {categories.data.map((category) => (
                <CategoryCard key={category.id} category={category} />
              ))}
            </div>
          ))}
      </section>
    </div>
  );
}
