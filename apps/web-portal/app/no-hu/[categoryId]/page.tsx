import { NoHuCategoryView } from '@/src/components/NoHuCategoryView';

export default function NoHuCategoryPage({ params }: { params: { categoryId: string } }) {
  return <NoHuCategoryView categoryId={params.categoryId} />;
}
