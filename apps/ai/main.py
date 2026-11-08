# apps/ai/main.py
# python main.py serve              chạy service (mặc định)
# python main.py backtest [--source file|db] [--refresh]
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
    sub.add_parser("verify")
    pr = sub.add_parser("predict")
    pr.add_argument("--source", choices=["file", "db"], default="db")
    args = ap.parse_args()

    logging.basicConfig(level=os.environ.get("LOG_LEVEL", "INFO"), format="%(asctime)s %(levelname)s %(message)s")
    cmd = args.cmd or "serve"
    if cmd == "serve":
        from src.patterns.service import run
        asyncio.run(run())
    elif cmd == "backtest":
        from src.patterns.pattern_backtest import main as backtest
        backtest(source=args.source, refresh=args.refresh)
    elif cmd == "verify":
        from src.patterns.verify import main as verify
        return verify()
    else:
        from src.patterns.pattern_predict import main as predict
        predict(source=args.source)
    return 0


if __name__ == "__main__":
    sys.exit(main())
