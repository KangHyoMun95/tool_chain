import { notFound } from 'next/navigation';
import { PortalShell } from '@/src/components/PortalShell';
import { StreamDetailView } from '@/src/components/StreamDetailView';
import { getConfidenceSeries, getStream, getStreamHistory } from '@/src/lib/portal-data';

export default function StreamDetailPage({ params }: { params: { streamId: string } }) {
  const stream = getStream(params.streamId);
  if (!stream) notFound();

  return (
    <PortalShell back={{ href: `/categories/${stream.categoryId}`, labelKey: 'nav.backToStreams' }}>
      <StreamDetailView
        stream={stream}
        history={getStreamHistory(stream)}
        confidence={getConfidenceSeries(stream)}
      />
    </PortalShell>
  );
}
