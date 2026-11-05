"use client";

import { useI18n } from "@/src/i18n/provider";
import { HudCard } from "../ui/HudCard";

// Khung chờ cho các khối phải đợi API: chỉ nhấp nháy (không hiệu ứng vào). Khi có dữ liệu, khối thật mới chạy hiệu ứng xuất hiện.

const BAR = "block rounded bg-white/15";

function CatalogCardSkeleton() {
  return (
    <div className="neon-panel flex animate-pulse items-center justify-between bg-[#0e0e13] p-3.5" aria-hidden="true">
      <span className="flex items-center gap-3">
        <span className="block h-14 w-14 rounded-xl bg-neon/25" />
        <span className="space-y-2">
          <span className={`${BAR} h-4 w-24`} />
          <span className={`${BAR} h-3 w-16 bg-white/10`} />
        </span>
      </span>
      <span className="block h-6 w-6 rounded-full bg-neon/35" />
    </div>
  );
}

/** Lưới thẻ lobby / category đang tải. */
export function CatalogGridSkeleton({ count = 4 }: { count?: number }) {
  const { t } = useI18n();
  return (
    <section className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-4" role="status" aria-busy="true" aria-label={t("common.loading")}>
      {Array.from({ length: count }, (_, i) => <CatalogCardSkeleton key={i} />)}
    </section>
  );
}

function StreamCardSkeleton() {
  return (
    <div className="flex animate-pulse flex-col justify-between rounded-2xl border-[1.5px] border-[rgba(255,38,62,0.35)] bg-[#101015] p-4" aria-hidden="true">
      <div>
        <div className="flex items-center justify-between border-b border-gray-800/80 pb-2">
          <span className="block h-8 w-14 rounded bg-neon/30" />
          <span className="block h-5 w-14 rounded-full bg-emerald-500/20" />
        </div>
        <div className="mt-3 space-y-2">
          <span className={`${BAR} h-3 w-40`} />
          <span className={`${BAR} h-3 w-20 bg-white/10`} />
        </div>
        <span className="mt-3 block h-16 rounded-xl bg-[#15151e]" />
        <div className="mt-3 flex justify-between">
          {Array.from({ length: 10 }, (_, i) => <span key={i} className="block h-6 w-6 rounded-full bg-white/10" />)}
        </div>
      </div>
      <span className="mt-4 block h-10 rounded-xl bg-neon/30" />
    </div>
  );
}

/** Lưới thẻ bàn đang tải. */
export function StreamGridSkeleton({ count = 3 }: { count?: number }) {
  const { t } = useI18n();
  return (
    <section className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3" role="status" aria-busy="true" aria-label={t("common.loading")}>
      {Array.from({ length: count }, (_, i) => <StreamCardSkeleton key={i} />)}
    </section>
  );
}

/** Banner đầu trang danh sách bàn đang tải (tên category chưa có). */
export function PageBannerSkeleton() {
  return (
    <HudCard className="flex animate-pulse items-center justify-between gap-3 px-4 py-3 sm:px-5" aria-hidden="true">
      <div className="flex items-center gap-3 sm:gap-4">
        <span className="block h-7 w-20 rounded-full bg-white/15" />
        <span className="block h-6 w-32 rounded bg-white/20" />
      </div>
      <span className="block h-9 w-44 rounded-full bg-neon/30" />
    </HudCard>
  );
}

/** Khung chờ của trang chi tiết bàn (2 cột). */
export function StreamDetailSkeleton() {
  const { t } = useI18n();
  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-12" role="status" aria-busy="true" aria-label={t("common.loading")}>
      <div className="flex flex-col gap-3 lg:col-span-5">
        <HudCard className="h-[300px] animate-pulse" aria-hidden="true" />
        <HudCard className="h-[150px] animate-pulse" aria-hidden="true" />
        <HudCard className="h-[80px] animate-pulse" aria-hidden="true" />
      </div>
      <div className="flex flex-col gap-3 lg:col-span-7">
        <HudCard className="h-[250px] animate-pulse" aria-hidden="true" />
        <HudCard className="h-[200px] animate-pulse" aria-hidden="true" />
      </div>
    </div>
  );
}
