import { LobbyBrowser } from '@/src/components/LobbyBrowser';
import { PortalShell } from '@/src/components/PortalShell';
import { SystemBanner } from '@/src/components/SystemBanner';

export default function PortalHomePage() {
  return (
    <PortalShell>
      <SystemBanner />
      <LobbyBrowser />
    </PortalShell>
  );
}
