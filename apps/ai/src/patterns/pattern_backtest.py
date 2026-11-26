# src/patterns/pattern_backtest.py
# Backtest pattern-v1 dùng CHUNG hàm thuần choose_pick với service. Mỗi ván chỉ dùng dữ liệu TRƯỚC nó:
# bảng đếm riêng từng stream, chuỗi theo (stream, shoe) sắp theo round, bỏ ignore_in_pattern, không nối qua shoe.
# Ký hiệu predictable / ignore_in_pattern / draw lấy từ config/categories theo category của stream (stream thiếu cấu hình bị bỏ qua).
# Baseline: luôn chọn ký hiệu predictable xuất hiện nhiều nhất (duy nhất) trong lịch sử của stream tính đến thời điểm đó.
import logging

import pandas as pd

from .category_config import CategoryRegistry
from .config import MAX_LEN, MIN_LEN
from .dataset import add_segments, load_sessions
from .pattern import PatternStats, choose_pick
from .run_rule import RULES, STRENGTH, blend_pick

log = logging.getLogger("pattern")


def _epoch(ts) -> float:
    """created_at (naive = UTC) -> epoch giây."""
    t = pd.Timestamp(ts)
    return (t.tz_localize("UTC") if t.tzinfo is None else t).timestamp()


def infer_categories(df: pd.DataFrame, registry: CategoryRegistry) -> pd.DataFrame:
    """DB thiếu streams / categories / lobbies: suy category của MỖI stream từ tập ký hiệu result của nó.

    Chọn category có `results` chứa tập ký hiệu của stream; nhiều category cùng chứa ⇒ lấy category có ít ký hiệu nhất,
    vẫn hòa (cùng số ký hiệu) thì bỏ stream (log WARNING). Không category nào chứa ⇒ bỏ stream. Stream nối được DB thì giữ tên thật.
    """
    cfgs = list(registry._by_key.values())
    lobby, category = df["lobby_name"].copy(), df["category_name"].copy()
    for sid, idx in df[df["lobby_name"] == "?"].groupby("stream_id").groups.items():
        seen = set(df.loc[idx, "result"])
        fit = sorted((c for c in cfgs if seen <= set(c.results)), key=lambda c: len(c.results))
        if not fit or (len(fit) > 1 and len(fit[0].results) == len(fit[1].results)):
            log.warning("Stream %s: không suy được category từ ký hiệu %s (khớp: %s); bỏ qua", sid, sorted(seen), [c.key for c in fit])
            lobby[idx] = category[idx] = None
            continue
        lobby[idx], category[idx] = fit[0].lobby, fit[0].category
    out = df.assign(lobby_name=lobby, category_name=category).dropna(subset=["lobby_name"])
    log.warning("Suy category theo ký hiệu: %s", out.groupby(["lobby_name", "category_name"])["stream_id"].nunique().to_dict())
    return out


def run(df: pd.DataFrame, registry: CategoryRegistry, half_life_minutes: int | None = None, shoe_weight: int = 1,
        rule_weights: tuple[float, ...] = (), rules: tuple[str, ...] = ("run",)) -> tuple[pd.DataFrame, int]:
    """df đã có cột segment (xem add_segments) và lobby_name / category_name. Trả (bảng mỗi ván có dự đoán, tổng số ván).

    half_life_minutes: bán rã trọng số theo độ mới (None = tắt, đúng pattern-v1); shoe_weight: hệ số shoe hiện tại (chỉ khi có half_life).
    Thời điểm của ván = cột happened_at (ended_at, như rebuild của service) nếu có, không thì created_at.
    """
    rows = []
    time_col = "happened_at" if "happened_at" in df.columns else "created_at"
    for sid, sdf in df.groupby("stream_id", sort=False):
        cfg = registry.get(str(sdf["lobby_name"].iloc[0]), str(sdf["category_name"].iloc[0]))
        if cfg is None:
            log.error("Bỏ qua stream %s: category %r / %r không có file định nghĩa trong config/categories",
                      sid, sdf["lobby_name"].iloc[0], sdf["category_name"].iloc[0])
            continue
        stats = PatternStats(cfg.predictable, half_life_minutes=half_life_minutes)
        seen = {s: 0 for s in cfg.predictable}                   # lịch sử cộng dồn của stream (cho baseline)
        # Các shoe/đoạn của stream theo thứ tự thời gian của ván đầu; trong đoạn theo round
        for _, seg in sorted(sdf.groupby("segment"), key=lambda kv: kv[1]["created_at"].min()):
            before = ""
            stats.begin_shoe()
            for res, created in zip(*(seg.sort_values("road_count")[c] for c in ("result", time_col))):
                if res not in cfg.results:
                    log.warning("Bỏ qua ván của stream %s: result %r không thuộc results của %s", sid, res, cfg.key)
                    continue
                row = {"stream_id": sid, "actual": res, "is_draw": res in cfg.draw, "pattern_pick": None, "baseline_pick": None}
                signals = {name: RULES[name](before, cfg.predictable) for name in rules}   # luật hình thù (độc lập với pattern-v1)
                for name, sig in signals.items():
                    row[f"rule_{name}"] = sig
                    if name in STRENGTH:
                        row[f"strength_{name}"] = STRENGTH[name](before, cfg.predictable)
                if len(before) >= MIN_LEN:
                    wl = (lambda pats, now=_epoch(created): stats.wlookup(pats, shoe_weight, now)) if half_life_minutes else None
                    p = choose_pick(before, stats.lookup, cfg.predictable, wlookup=wl)
                    if p["pick"]:
                        row.update(pattern_pick=p["pick"], pct=p["confidence"], length=p["chosen"]["k"], n=p["chosen"]["occurrences"])
                        for name, sig in signals.items():
                            for w in rule_weights:
                                row[f"blend_{name}_{w}"] = blend_pick(p, sig, w, cfg.predictable)[0]
                top = max(seen.values())
                winners = [s for s, n in seen.items() if n == top]
                if len(winners) == 1:
                    row["baseline_pick"] = winners[0]
                rows.append(row)
                stats.add_result(before, res, _epoch(created))
                if res in seen:
                    seen[res] += 1
                if res not in cfg.ignore_in_pattern:
                    before = (before + res)[-MAX_LEN:]
    return pd.DataFrame(rows), len(rows)


def _summary(name: str, r: pd.DataFrame, col: str, total: int) -> dict:
    picked = r[r[col].notna()]
    scored = picked[~picked["is_draw"]]                         # ván ra kết quả "hòa" (draw) chưa tính đúng/sai
    hit = (scored[col] == scored["actual"]).sum()
    return {
        "mô hình": name, "ván có dự đoán": len(picked), "độ phủ": f"{len(picked) / total:.1%}" if total else "-",
        "đúng": int(hit), "sai": len(scored) - int(hit), "hòa (draw)": len(picked) - len(scored),
        "tỉ lệ đúng": f"{hit / len(scored):.2%}" if len(scored) else "-",
    }


def _by_strength(name: str, r: pd.DataFrame) -> None:
    """Tỉ lệ đúng của luật theo ĐỘ MẠNH của hình (độ dài khớp), kèm pattern-v1 trên đúng những ván đó và ±2 sai số chuẩn.

    Mục tiêu của luật hình thù là bắt đúng khi hình rõ, còn hình yếu ≈ 50% là chấp nhận được: nếu hình dài hơn mà tỉ lệ đúng
    không tăng thì luật không bắt được hình thật.
    """
    col, sc = f"rule_{name}", f"strength_{name}"
    d = r[r[col].notna() & ~r["is_draw"]].copy()
    if d.empty:
        return
    d["hit"] = d[col] == d["actual"]
    d["p_hit"] = d["pattern_pick"].notna() & (d["pattern_pick"] == d["actual"])
    d["p_has"] = d["pattern_pick"].notna()
    d["bucket"] = pd.cut(d[sc], [0, 1, 2, 3, 4, 5, 6, 8, 100], labels=["1", "2", "3", "4", "5", "6", "7-8", "9+"])
    g = d.groupby("bucket", observed=True).agg(so_van=("hit", "size"), luat_dung=("hit", "mean"), pv1_co_du_doan=("p_has", "sum"), pv1_dung_tren_van_co=("p_hit", "sum"))
    g["±2se"] = (2 * (g["luat_dung"] * (1 - g["luat_dung"]) / g["so_van"]) ** 0.5).round(4)
    g["pv1_dung"] = (g["pv1_dung_tren_van_co"] / g["pv1_co_du_doan"]).where(g["pv1_co_du_doan"] > 0)
    print(f"\nLuật {name} theo độ mạnh của hình (độ dài khớp; bỏ ván hòa):")
    print(g[["so_van", "luat_dung", "±2se", "pv1_dung"]].round(4))


def main(registry: CategoryRegistry, source: str = "file", refresh: bool = False,
         half_life_minutes: int | None = None, shoe_weight: int = 1, since: str = "2026-01-01", assume_category: tuple[str, str] | None = None, infer_category: bool = False,
         rule_weights: tuple[float, ...] = (), rules: tuple[str, ...] = ("run",), structure: int = 0, shapes: int = 0, shapes_file: str | None = None) -> None:
    df = load_sessions(since=since, source=source, refresh=refresh, assume_category=("?", "?") if infer_category else assume_category)
    if infer_category:
        df = infer_categories(df, registry)
    df = add_segments(df)
    if shapes:
        from .shapes_test import load_shapes, main as shapes_test
        shapes_test(df, registry, n_perm=shapes, shapes=load_shapes(shapes_file) if shapes_file else None)
        return
    if structure:
        from .structure_test import main as structure_test
        structure_test(df, registry, n_perm=structure)
        return
    r, total = run(df, registry, half_life_minutes, shoe_weight, rule_weights, rules)
    weighting = f"half-life {half_life_minutes} phút, shoe_weight {shoe_weight}" if half_life_minutes else "tắt (pattern-v1)"
    print(f"{total} ván, {df['stream_id'].nunique()} stream (nguồn: {source}); trọng số theo độ mới: {weighting}\n")
    if not total:
        print("Không có ván nào để backtest: DB trả 0 ván FINISHED có result (từ 2026-01-01), hoặc mọi stream bị bỏ qua vì category không có file trong config/categories. "
              "Kiểm tra DATABASE_URL_READONLY có trỏ đúng DB có dữ liệu không và log ERROR phía trên.")
        return
    print(pd.DataFrame([_summary("pattern-v1", r, "pattern_pick", total),
                        _summary("baseline (nhiều hơn trong lịch sử)", r, "baseline_pick", total),
                        *[_summary(f"luật {n} (riêng)", r, f"rule_{n}", total) for n in rules],
                        *[_summary(f"pattern-v1 + {n} (w={w})", r, f"blend_{n}_{w}", total) for n in rules for w in rule_weights]]).to_string(index=False))

    for name in rules:
        if name in STRENGTH:
            _by_strength(name, r)

    both = r[r["pattern_pick"].notna() & r["baseline_pick"].notna() & ~r["is_draw"]]
    skipped = int((r["pattern_pick"].notna() & r["baseline_pick"].isna()).sum())
    if len(both):
        print(f"\nCùng một tập ván (pattern có dự đoán và baseline có ký hiệu nhiều nhất duy nhất): {len(both)} ván, bỏ qua {skipped} ván do hòa số lần trong lịch sử")
        print(f"  pattern-v1: {(both['pattern_pick'] == both['actual']).mean():.2%}   baseline: {(both['baseline_pick'] == both['actual']).mean():.2%}")

    p = r[r["pattern_pick"].notna() & ~r["is_draw"]].copy()
    if p.empty:
        return
    p["hit"] = p["pattern_pick"] == p["actual"]
    print(f"\n% hiển thị trung bình: {p['pct'].mean():.2%}")
    p["bucket"] = pd.cut(p["pct"], [0, .5, .6, .7, .8, .9, 1.0], include_lowest=True)
    print("\nTheo mức % hiển thị:")
    print(p.groupby("bucket", observed=True).agg(so_lan=("hit", "size"), pct_hien_thi=("pct", "mean"),
                                                 dung_thuc_te=("hit", "mean")).round(4))
    print("\nTheo độ dài đuôi k được chọn:")
    print(p.groupby("length").agg(so_lan=("hit", "size"), pct_hien_thi=("pct", "mean"),
                                  dung_thuc_te=("hit", "mean")).round(4))
