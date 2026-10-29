"use client";

import Link from "next/link";
import { useI18n } from "@/src/i18n/provider";
import type { Category } from "@/src/lib/portal-data";

export function CategoryCard({ category }: { category: Category }) {
  const { t } = useI18n();

  return (
    <div className="card card-dark card-hover category-card">
      <div>
        <h3 className="card-title-amber">{category.name}</h3>
        <p className="muted-on-dark">{t("categories.liveTables", { count: category.streamCount })}</p>
      </div>
      <div className="category-foot">
        <div>
          <p className="micro-label">{t("categories.aiWinRate")}</p>
          <p className="metric metric-amber">{category.aiWinRate.toFixed(1)}%</p>
        </div>
        <Link href={`/categories/${category.id}`} className="btn btn-amber btn-sm">
          {t("categories.openStreams")}
        </Link>
      </div>
    </div>
  );
}
