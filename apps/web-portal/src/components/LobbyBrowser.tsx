"use client";

import { useState } from "react";
import { useI18n } from "@/src/i18n/provider";
import type { Category, Lobby } from "@/src/lib/portal-data";
import { CategoryCard } from "./CategoryCard";
import { LobbyCard } from "./LobbyCard";

export function LobbyBrowser({
  lobbies,
  categoriesByLobby,
}: {
  lobbies: Lobby[];
  categoriesByLobby: Record<string, Category[]>;
}) {
  const { t } = useI18n();
  const [activeId, setActiveId] = useState(lobbies[0]?.id ?? "");
  const active = lobbies.find((l) => l.id === activeId);
  const categories = categoriesByLobby[activeId] ?? [];

  return (
    <div className="split">
      <section className="split-side stack-sm">
        <div className="section-head">
          <h2 className="section-title">{t("lobbies.title")}</h2>
          <span className="chip chip-dark">{t("lobbies.count", { count: lobbies.length })}</span>
        </div>
        {lobbies.map((lobby) => (
          <LobbyCard
            key={lobby.id}
            lobby={lobby}
            active={lobby.id === activeId}
            onSelect={() => setActiveId(lobby.id)}
          />
        ))}
      </section>

      <section className="split-main">
        <div className="section-head">
          <h2 className="section-title">{t("categories.title", { lobby: active?.name ?? "" })}</h2>
          <p className="hint">{t("categories.hint")}</p>
        </div>
        <div className="grid grid-2">
          {categories.map((category) => (
            <CategoryCard key={category.id} category={category} />
          ))}
        </div>
      </section>
    </div>
  );
}
