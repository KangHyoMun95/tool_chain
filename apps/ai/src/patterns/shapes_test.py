# src/patterns/shapes_test.py
# Đo TRỰC TIẾP các hình do chủ dự án nêu (không qua luật diễn giải) + dò tuần hoàn / lặp lại theo độ trễ. Chỉ phân tích offline.
# Mỗi shoe: chuỗi ký hiệu đã bỏ ignore_in_pattern. Chỉ category có đúng 2 ký hiệu predictable (1 = predictable[0], 2 = predictable[1];
# hình được gộp cả hai chiều 1<->2 vì hình đối xứng theo ký hiệu).
import logging
import math

import numpy as np
import pandas as pd

from .category_config import CategoryRegistry
from .structure_test import _shoes

log = logging.getLogger("pattern")

# hình do chủ dự án nêu: đuôi -> ký hiệu kế tiếp được cho là đúng
SHAPES = {"1212": "1", "1221": "2", "12212": "2", "1211": "2", "111": "1", "11111": "1", "2211": "2", "22112": "2",
          "1222": "2", "12221": "2"}


def load_shapes(path: str) -> dict[str, str]:
    """Đọc file hình: mỗi dòng `đuôi>dự_đoán` (ký hiệu chỉ gồm 1 và 2, vd `1221>2`), `#` mở đầu = ghi chú, dòng trống bỏ qua.
    Sai định dạng ⇒ ValueError kèm số dòng. Trùng đuôi ⇒ lỗi."""
    out: dict[str, str] = {}
    with open(path, encoding="utf-8") as f:
        for no, raw in enumerate(f, 1):
            line = raw.split("#", 1)[0].strip()
            if not line:
                continue
            tail, sep, pred = (x.strip() for x in line.partition(">"))
            if not sep or not tail or set(tail) - set("12") or pred not in ("1", "2"):
                raise ValueError(f"{path}:{no}: dòng sai định dạng {raw.strip()!r}; cần dạng 1221>2 (chỉ dùng 1 và 2)")
            if len(tail) < 2:
                raise ValueError(f"{path}:{no}: đuôi phải có ít nhất 2 ký hiệu")
            if tail in out:
                raise ValueError(f"{path}:{no}: đuôi {tail} bị trùng")
            out[tail] = pred
    if not out:
        raise ValueError(f"{path}: không có hình nào")
    return out


def _count(seqs: list[str], tail: str, pred: str, a: str, b: str) -> tuple[int, int]:
    """(số lần đuôi xuất hiện rồi có ký hiệu kế tiếp, số lần ký hiệu kế tiếp = dự đoán), gộp cả hai chiều a<->b."""
    n = hit = 0
    for swap in (False, True):
        m = {"1": b if swap else a, "2": a if swap else b}
        t, p, L = "".join(m[c] for c in tail), m[pred], len(tail)
        for s in seqs:
            i = s.find(t)
            while i != -1:
                j = i + L
                if j < len(s):
                    n += 1
                    hit += s[j] == p
                i = s.find(t, i + 1)
    return n, hit


def _row(label: str, n: int, hit: int) -> dict:
    r = hit / n if n else float("nan")
    z = (hit - n / 2) / math.sqrt(n / 4) if n else float("nan")
    return {"hình": label, "số lần": n, "đúng": f"{r:.4f}", "z (so 50%)": f"{z:+.2f}", "±2se": f"{2 * math.sqrt(r * (1 - r) / n):.4f}" if n else "-"}


def _runs_table(seqs: list[str]) -> pd.DataFrame:
    """Bệt: sau một đoạn cùng ký hiệu dài ĐÚNG L (L = 1..9) thì ván kế tiếp tiếp tục đoạn đó bao nhiêu %."""
    # Mỗi lần thử: đoạn đã dài >= L VÀ còn ván kế tiếp trong shoe (đoạn chạm cuối shoe không bị tính là "không tiếp tục"); đúng = ván đó cùng ký hiệu.
    trials = {L: 0 for L in range(1, 11)}
    cont = {L: 0 for L in range(1, 11)}
    for s in seqs:
        i = 0
        while i < len(s):
            j = i
            while j < len(s) and s[j] == s[i]:
                j += 1
            for L in range(1, min(j - i, 10) + 1):
                if i + L < len(s):
                    trials[L] += 1
                    cont[L] += i + L < j
            i = j
    rows = []
    for L in range(1, 10):
        reached, passed = trials[L], cont[L]
        rows.append({"hình": f"bệt đúng L={L}→tiếp tục", "số lần": reached, "đúng": f"{passed / reached:.4f}" if reached else "-",
                     "z (so 50%)": f"{(passed - reached / 2) / math.sqrt(reached / 4):+.2f}" if reached else "-"})
    return pd.DataFrame(rows)


def _lags(seqs: list[str], a: str, n_perm: int, max_lag: int, seed: int) -> pd.DataFrame:
    """P(kết quả i == kết quả i - lag) trong cùng shoe, so với xáo trộn trong shoe. Lặp lại / tuần hoàn chu kỳ lag sẽ lệch khỏi null."""
    arr = np.concatenate([np.frombuffer(s.encode(), dtype=np.uint8) == ord(a) for s in seqs]).astype(np.int8)
    sid = np.concatenate([np.full(len(s), k) for k, s in enumerate(seqs)])
    rng = np.random.default_rng(seed)

    def rate(x: np.ndarray, lag: int) -> float:
        ok = sid[lag:] == sid[:-lag]
        return float((x[lag:] == x[:-lag])[ok].mean())

    real = {lag: rate(arr, lag) for lag in range(1, max_lag + 1)}
    null = {lag: [] for lag in real}
    for _ in range(n_perm):
        x = arr[np.lexsort((rng.random(len(arr)), sid))]       # xáo trộn thứ tự trong từng shoe
        for lag in real:
            null[lag].append(rate(x, lag))
    rows = []
    for lag, r in real.items():
        mu, sd = float(np.mean(null[lag])), float(np.std(null[lag], ddof=1))
        rows.append({"độ trễ": lag, "trùng nhau": f"{r:.4f}", "xáo trộn (TB)": f"{mu:.4f}", "z": f"{(r - mu) / sd:+.2f}",
                     "": "<<<" if abs((r - mu) / sd) >= 3 else ""})
    return pd.DataFrame(rows)


def _scan_counts(seqs: list[str], kmin: int, kmax: int) -> dict[str, list[int]]:
    """Mọi đuôi độ dài kmin..kmax trong mọi shoe, GỘP hai chiều ký hiệu: dạng chuẩn = ký hiệu đầu đuôi là 1, còn lại là 2.
    Kết quả kế tiếp = 1 nếu trùng ký hiệu đầu đuôi. Trả {dạng: [số lần, số lần kết quả kế = 1]}."""
    out: dict[str, list[int]] = {}
    for s in seqs:
        for k in range(kmin, kmax + 1):
            for i in range(k, len(s)):
                tail = s[i - k:i]
                first = tail[0]
                key = "".join("1" if c == first else "2" for c in tail)
                e = out.setdefault(key, [0, 0])
                e[0] += 1
                e[1] += s[i] == first
    return out


def _scan(seqs: list[str], n_perm: int, kmin: int, kmax: int, seed: int, top: int = 12) -> None:
    """Quét MỌI hình (không giả định trước hình nào) và so từng hình với dữ liệu xáo trộn trong shoe: hình nào có tỉ lệ 'tiếp theo giống ký hiệu
    đầu của hình' lệch khỏi xáo trộn. Với M hình, ngưỡng cần vượt ~ Bonferroni (z ≈ 3.7 cho ~250 hình)."""
    import random
    rng = random.Random(seed)
    real = _scan_counts(seqs, kmin, kmax)
    acc: dict[str, list[float]] = {k: [] for k in real}
    for _ in range(n_perm):
        sh = []
        for s in seqs:
            c = list(s)
            rng.shuffle(c)
            sh.append("".join(c))
        got = _scan_counts(sh, kmin, kmax)
        for k in real:
            n, h = got.get(k, [0, 0])
            acc[k].append(h / n if n else float("nan"))
    rows = []
    for k, (n, h) in real.items():
        arr = np.array(acc[k], dtype=float)
        arr = arr[~np.isnan(arr)]
        if n < 30 or len(arr) < 10 or arr.std(ddof=1) == 0:
            continue
        r = h / n
        z = (r - arr.mean()) / arr.std(ddof=1)
        rows.append({"hình (1 = ký hiệu đầu)": k, "số lần": n, "kế tiếp = 1": f"{r:.4f}", "xáo trộn (TB)": f"{arr.mean():.4f}", "z": z})
    if not rows:
        print("Không đủ dữ liệu để quét hình.")
        return
    d = pd.DataFrame(rows)
    thr = 3.7
    big = int((d["z"].abs() >= thr).sum())
    print(f"Đã quét {len(d)} hình (độ dài {kmin}..{kmax}, mỗi hình >= 30 lần). Số hình có |z| >= {thr} (ngưỡng đã tính cho nhiều phép đo): {big}. "
          f"Nếu dữ liệu ngẫu nhiên, kỳ vọng ≈ {len(d) * 2 * 1e-4:.2f}.")
    d = d.reindex(d["z"].abs().sort_values(ascending=False).index).head(top)
    d["z"] = d["z"].map(lambda v: f"{v:+.2f}")
    print(d.to_string(index=False))


def _canon(tail: str) -> tuple[str, str]:
    first = tail[0]
    return "".join("1" if c == first else "2" for c in tail), first


def _validate(timed: list[tuple[object, str]], kmin: int = 3, kmax: int = 8, min_n: int = 50, min_z: float = 2.5) -> None:
    """KIỂM CHỨNG NGOÀI MẪU, chỉ trên ván CÓ HÌNH. Chia shoe theo thời gian: nửa đầu = học, nửa sau = đo.

    Học: mọi hình (gộp hai chiều, độ dài kmin..kmax) có >= min_n lần và |z nhị thức so 50%| >= min_z; ghi hướng (kế tiếp = ký hiệu đầu hay khác).
    Đo: ở nửa sau, mỗi ván mà đuôi khớp một hình đã chọn thì dự đoán theo hướng đã học (nhiều hình cùng khớp ⇒ lấy hình |z| học lớn nhất);
    ván không khớp hình nào KHÔNG được tính. Báo số ván có hình, tỉ lệ đúng, z so với 50%.
    """
    timed = sorted(timed, key=lambda t: t[0])
    cut = len(timed) // 2
    train, test = [s for _, s in timed[:cut]], [s for _, s in timed[cut:]]
    chosen: dict[str, tuple[float, bool]] = {}                    # dạng -> (|z|, kế tiếp = ký hiệu đầu?)
    for key, (n, h) in _scan_counts(train, kmin, kmax).items():
        if n >= min_n:
            z = (h - n / 2) / math.sqrt(n / 4)
            if abs(z) >= min_z:
                chosen[key] = (abs(z), h / n > 0.5)
    print(f"Học ở nửa đầu ({len(train)} shoe), đo ở nửa sau ({len(test)} shoe). Hình được chọn từ nửa đầu (n >= {min_n}, |z| >= {min_z}): {len(chosen)}.")
    n_rounds = n_shape = hit = 0
    for s in test:
        for i in range(kmin, len(s)):
            n_rounds += 1
            best = None
            for k in range(kmin, min(kmax, i) + 1):
                key, first = _canon(s[i - k:i])
                c = chosen.get(key)
                if c and (best is None or c[0] > best[0]):
                    best = (c[0], c[1], first)
            if best:
                n_shape += 1
                pred_first = best[1]
                hit += (s[i] == best[2]) == pred_first
    if not n_shape:
        print("Nửa sau không có ván nào khớp hình đã chọn.")
        return
    r = hit / n_shape
    print(f"Nửa sau: {n_rounds} ván xét, {n_shape} ván CÓ HÌNH ({n_shape / n_rounds:.1%}); tỉ lệ đúng trên ván có hình = {r:.4f} "
          f"(±2se {2 * math.sqrt(r * (1 - r) / n_shape):.4f}), z so với 50% = {(hit - n_shape / 2) / math.sqrt(n_shape / 4):+.2f}")


def main(df: pd.DataFrame, registry: CategoryRegistry, n_perm: int = 200, max_lag: int = 20, seed: int = 1, shapes: dict[str, str] | None = None) -> None:
    shapes = shapes or SHAPES
    for (lobby, category), cdf in df.groupby(["lobby_name", "category_name"]):
        cfg = registry.get(str(lobby), str(category))
        if cfg is None or len(cfg.predictable) != 2:
            continue
        a, b = cfg.predictable
        seqs = _shoes(cdf, cfg, set(cfg.ignore_in_pattern))
        print(f"\n===== {cfg.key}: {len(seqs)} shoe, {sum(map(len, seqs))} kết quả (1={a}, 2={b}; gộp cả hai chiều) =====")
        print("\n(1) Các hình bạn nêu: sau đuôi này, ký hiệu kế tiếp có đúng như dự đoán không?")
        rows = []
        for tail, pred in shapes.items():
            n, hit = _count(seqs, tail, pred, a, b)
            rows.append(_row(f"{tail}→{pred}", n, hit))
        print(pd.DataFrame(rows).to_string(index=False))
        print("\n(2) Cầu bệt: đoạn cùng ký hiệu đã dài L thì có dài thêm 1 không (50% = không thiên lệch):")
        print(_runs_table(seqs).to_string(index=False))
        print("\n(5) KIỂM CHỨNG NGOÀI MẪU, chỉ tính ván có hình (học nửa đầu theo thời gian, đo nửa sau):")
        timed = [(g["created_at"].min(), "".join(r for r in g.sort_values("road_count")["result"] if r in cfg.results and r not in set(cfg.ignore_in_pattern)))
                 for _, g in cdf.groupby("segment")]
        _validate([(t, q) for t, q in timed if len(q) > 3])
        print("\n(4) QUÉT MỌI HÌNH (không giả định trước hình nào; gộp hai chiều ký hiệu):")
        _scan(seqs, n_perm, 3, 8, seed)
        print(f"\n(3) Lặp lại / tuần hoàn: xác suất kết quả giống kết quả cách {1}..{max_lag} ván trước, so với xáo trộn ({n_perm} lần). <<< = |z| >= 3:")
        print(_lags(seqs, a, n_perm, max_lag, seed).to_string(index=False))
    print("\nLưu ý: nhiều dòng cùng lúc, chỉ tin |z| lớn (>= 3~4) và lặp lại ở dữ liệu khác / category khác.")
