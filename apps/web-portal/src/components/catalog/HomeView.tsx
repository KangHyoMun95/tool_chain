"use client";

import { useState } from "react";
import { useApi } from "@/src/hooks/use-api";
import { useI18n } from "@/src/i18n/provider";
import { listLobbies } from "@/src/lib/api/catalog";
import { EmptyState, ErrorState, LoadingState } from "../DataStates";
import { AppShell } from "../shell/AppShell";
import { CatalogCard } from "./CatalogCard";
import { HeroBanner } from "./HeroBanner";
import { NoticeTicker } from "./NoticeTicker";

/** Trang chủ: banner, thẻ các lobby đang có trong DB, dải thông báo. */
export function HomeView() {
  const { t } = useI18n();
  const lobbies = useApi(listLobbies, []);
  const [clicked, setClicked] = useState<string | null>(null);

  return (
    <AppShell sidebar>
      <HeroBanner />
      {lobbies.status === "loading" && <LoadingState />}
      {lobbies.status === "error" && <ErrorState error={lobbies.error} onRetry={lobbies.reload} />}
      {lobbies.status === "success" &&
        (lobbies.data.length === 0 ? (
          <EmptyState message={t("lobbies.empty")} />
        ) : (
          <section className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
            {lobbies.data.map((lobby, i) => (
              <CatalogCard
                key={lobby.id}
                kind="lobbies"
                name={lobby.name}
                subtitle={t("lobbies.categoryCount", { count: lobby.categoryCount })}
                href={`/lobbies/${lobby.id}`}
                index={i}
                total={lobbies.data.length}
                clicked={clicked === lobby.id}
                onClick={() => setClicked(lobby.id)}
              />
            ))}
          </section>
        ))}
      <NoticeTicker />
    </AppShell>
  );
}
