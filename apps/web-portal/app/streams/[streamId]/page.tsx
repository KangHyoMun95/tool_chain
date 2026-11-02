import { StreamDetailView } from '@/src/components/StreamDetailView';

export default function StreamDetailPage({ params }: { params: { streamId: string } }) {
  return <StreamDetailView streamId={params.streamId} />;
}
