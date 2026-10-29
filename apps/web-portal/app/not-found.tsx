import { NotFoundView } from '@/src/components/NotFoundView';
import { PortalShell } from '@/src/components/PortalShell';

export default function NotFound() {
  return (
    <PortalShell>
      <NotFoundView />
    </PortalShell>
  );
}
