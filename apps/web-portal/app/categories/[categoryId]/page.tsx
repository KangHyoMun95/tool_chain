import { CategoryStreamsView } from '@/src/components/CategoryStreamsView';
import { PortalShell } from '@/src/components/PortalShell';

export default function CategoryStreamsPage({ params }: { params: { categoryId: string } }) {
  return (
    <PortalShell back={{ href: '/', labelKey: 'nav.backToLobbies' }}>
      <CategoryStreamsView categoryId={params.categoryId} />
    </PortalShell>
  );
}
