"use client";

import { useI18n } from "@/src/i18n/provider";
import type { Lobby } from "@/src/lib/api/catalog";

export function LobbyCard({
  lobby,
  active,
  onSelect,
}: {
  lobby: Lobby;
  active: boolean;
  onSelect: () => void;
}) {
  const { t } = useI18n();

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={active}
      className={`card card-glass card-hover lobby-card${active ? " is-active" : ""}`}
    >
      <span className="lobby-main">
        <span className="lobby-initial">{lobby.initial}</span>
        <span className="lobby-text">
          <span className="lobby-name">{lobby.name}</span>
        </span>
      </span>
      <span className="chip chip-count">{t("lobbies.tables", { count: lobby.streamCount })}</span>
    </button>
  );
}
