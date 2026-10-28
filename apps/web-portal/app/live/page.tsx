// apps/web-portal/src/app/live/page.tsx
"use client";

import { useLiveItems } from "@/src/hooks/use-live-items";

export default function LivePage() {
  const { ticks, status } = useLiveItems(["BTC", "ETH", "SOL"]);
  return (
    <main className="p-6">
      <p>Trạng thái: {status}</p>
      <table>
        <tbody>
          {Object.values(ticks).map((t) => (
            <tr key={t.item_id}>
              <td className="pr-4">{t.item_id}</td>
              <td className="pr-4">{String(t.data.price)}</td>
              <td>{new Date(t.ts * 1000).toLocaleTimeString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}