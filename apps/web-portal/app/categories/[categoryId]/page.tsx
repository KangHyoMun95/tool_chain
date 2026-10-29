import { notFound } from 'next/navigation';
import { CategoryStreamsView } from '@/src/components/CategoryStreamsView';
import { PortalShell } from '@/src/components/PortalShell';
import { getCategory, listStreams } from '@/src/lib/portal-data';

export default function CategoryStreamsPage({ params }: { params: { categoryId: string } }) {
  const category = getCategory(params.categoryId);
  if (!category) notFound();

  return (
    <PortalShell back={{ href: '/', labelKey: 'nav.backToLobbies' }}>
      <CategoryStreamsView category={category} streams={listStreams(category.id)} />
    </PortalShell>
  );
}
