import { CategoryStreamsView } from '@/src/components/CategoryStreamsView';

export default function CategoryStreamsPage({ params }: { params: { categoryId: string } }) {
  return <CategoryStreamsView categoryId={params.categoryId} />;
}
