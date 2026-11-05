import { StreamDetailView } from '@/src/components/stream/StreamDetailView';

export default function StreamDetailPage({ params }: { params: { streamId: string } }) {
  return <StreamDetailView streamId={params.streamId} />;
}
