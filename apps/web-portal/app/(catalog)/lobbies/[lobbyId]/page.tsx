import { LobbyView } from '@/src/components/catalog/LobbyView';

export default function LobbyPage({ params }: { params: { lobbyId: string } }) {
  return <LobbyView lobbyId={params.lobbyId} />;
}
