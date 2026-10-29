import { LobbyBrowser } from '@/src/components/LobbyBrowser';
import { PortalShell } from '@/src/components/PortalShell';
import { SystemBanner } from '@/src/components/SystemBanner';
import { listCategories, listLobbies } from '@/src/lib/portal-data';

export default function PortalHomePage() {
  const lobbies = listLobbies();
  const categoriesByLobby = Object.fromEntries(
    lobbies.map((lobby) => [lobby.id, listCategories(lobby.id)]),
  );

  return (
    <PortalShell>
      <SystemBanner />
      <LobbyBrowser lobbies={lobbies} categoriesByLobby={categoriesByLobby} />
    </PortalShell>
  );
}
