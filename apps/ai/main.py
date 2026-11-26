# apps/ai/main.py
# python main.py serve              chạy service (mặc định)
# python main.py backtest [--source file|db] [--refresh] [--since YYYY-MM-DD] [--assume-category 'lobby|category' | --infer-category] [--half-life MINUTES] [--shoe-weight N] [--rule-weights 0.1,0.3] [--rules run,repeat,mirror]
# python main.py verify             so khớp bảng đếm Redis với đếm brute-force từ DB
# python main.py predict            in dự đoán một lần cho các stream đang hoạt động (cần DB)
import argparse
import asyncio
import logging
import os
import sys


def main() -> int:
    ap = argparse.ArgumentParser(description="AI pattern predict")
    sub = ap.add_subparsers(dest="cmd")
    sub.add_parser("serve")
    bt = sub.add_parser("backtest")
    bt.add_argument("--source", choices=["file", "db"], default="file", help="file: data/sessions.parquet (lấy từ DB nếu chưa có); db: đọc DB")
    bt.add_argument("--refresh", action="store_true", help="với --source file: lấy lại từ DB và ghi đè file")
    bt.add_argument("--half-life", type=int, default=None, metavar="MINUTES", help="bán rã trọng số theo độ mới (phút); bỏ trống = tắt (pattern-v1)")
    bt.add_argument("--shoe-weight", type=int, default=1, metavar="N", help="hệ số shoe hiện tại (>= 1, chỉ khi có --half-life)")
    bt.add_argument("--since", default="2026-01-01", metavar="YYYY-MM-DD", help="chỉ lấy ván tạo từ ngày này (mặc định 2026-01-01); DB cũ hơn thì lùi ngày lại")
    bt.add_argument("--assume-category", default=None, metavar="LOBBY|CATEGORY", help='chỉ khi DB thiếu streams/categories/lobbies: gán category này cho mọi ván không nối được, vd "casino|SEXY - BACCARAT" (cần --source db)')
    bt.add_argument("--infer-category", action="store_true", help="chỉ khi DB thiếu streams/categories/lobbies: suy category của từng stream theo tập ký hiệu result (cần --source db; không dùng cùng --assume-category)")
    bt.add_argument("--rule-weights", default="", help="thử trộn luật độ dài đoạn vào %% của pattern-v1, vd 0.1,0.3 (w = trọng số của luật, 0..1)")
    bt.add_argument("--rules", default="run", help="luật hình thù thử nghiệm: run (độ dài đoạn), repeat (lặp lại), mirror (đối xứng); cách nhau bằng dấu phẩy")
    sub.add_parser("verify")
    pr = sub.add_parser("predict")
    pr.add_argument("--source", choices=["file", "db"], default="db")
    args = ap.parse_args()

    logging.basicConfig(level=os.environ.get("LOG_LEVEL", "INFO"), format="%(asctime)s %(levelname)s %(message)s")
    cmd = args.cmd or "serve"

    # Mọi lệnh đều cần cấu hình category (config/categories/*.json): sai / thiếu ⇒ KHÔNG chạy, in tất cả lỗi.
    from src.patterns.category_config import CategoryConfigError, load_registry
    try:
        registry = load_registry()
    except CategoryConfigError as e:
        print(e, file=sys.stderr)
        return 1

    if cmd == "serve":
        from src.patterns.service import run
        asyncio.run(run(registry))
    elif cmd == "backtest":
        from src.patterns.pattern_backtest import main as backtest
        from src.patterns.run_rule import RULES
        bad = [x for x in args.rules.split(",") if x.strip() and x.strip() not in RULES]
        if bad:
            print(f"--rules không hợp lệ: {bad}; chọn trong {list(RULES)}", file=sys.stderr)
            return 1
        if args.infer_category and (args.source != "db" or args.assume_category):
            print("--infer-category cần --source db và không dùng cùng --assume-category", file=sys.stderr)
            return 1
        assume = None
        if args.assume_category:
            if args.source != "db" or args.assume_category.count("|") != 1:
                print('--assume-category cần --source db và dạng "lobby|category"', file=sys.stderr)
                return 1
            assume = tuple(x.strip() for x in args.assume_category.split("|"))
        backtest(registry, source=args.source, refresh=args.refresh, half_life_minutes=args.half_life, shoe_weight=args.shoe_weight, since=args.since, assume_category=assume, infer_category=args.infer_category,
                 rule_weights=tuple(float(x) for x in args.rule_weights.split(",") if x.strip()),
                 rules=tuple(x.strip() for x in args.rules.split(",") if x.strip()))
    elif cmd == "verify":
        from src.patterns.verify import main as verify
        return verify(registry)
    else:
        from src.patterns.pattern_predict import main as predict
        predict(registry, source=args.source)
    return 0


if __name__ == "__main__":
    sys.exit(main())
