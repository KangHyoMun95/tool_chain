# src/ai/train.py
import json
from datetime import datetime, timezone
from pathlib import Path

import joblib
import lightgbm as lgb
import numpy as np
from scipy.stats import binomtest
from sklearn.metrics import accuracy_score, log_loss

from dataset import load_sessions, build_features

def main():
    raw = load_sessions()
    df, feats, classes = build_features(raw)
    df = df.sort_values("created_at").reset_index(drop=True)
    labels = list(range(len(classes)))
    print(f"{len(df)} phiên, {len(classes)} nhãn: {classes}")

    # Chia theo thời gian
    n = len(df)
    tr, va, te = df.iloc[: int(n * .70)], df.iloc[int(n * .70): int(n * .85)], df.iloc[int(n * .85):]
    X_tr, y_tr = tr[feats], tr["y"]
    X_va, y_va = va[feats], va["y"]
    X_te, y_te = te[feats], te["y"]

    # Baseline
    majority = y_tr.value_counts().idxmax()
    base_acc = accuracy_score(y_te, np.full(len(y_te), majority))
    prior = y_tr.value_counts(normalize=True).reindex(labels, fill_value=1e-9).to_numpy()
    base_ll = log_loss(y_te, np.tile(prior, (len(y_te), 1)), labels=labels)

    # LightGBM
    model = lgb.LGBMClassifier(
        n_estimators=2000, learning_rate=0.03, num_leaves=15,
        min_child_samples=50, subsample=0.8, subsample_freq=1,
        colsample_bytree=0.8, verbose=-1,
    )
    model.fit(X_tr, y_tr, eval_set=[(X_va, y_va)],
              callbacks=[lgb.early_stopping(100, verbose=False)])

    proba = model.predict_proba(X_te)
    pred = proba.argmax(1)
    acc = accuracy_score(y_te, pred)
    ll = log_loss(y_te, proba, labels=labels)

    # Có hơn baseline thật không?
    p_value = binomtest(int((pred == y_te).sum()), len(y_te), base_acc, alternative="greater").pvalue

    print(f"\n{'':10}{'accuracy':>10}{'log loss':>10}")
    print(f"{'baseline':10}{base_acc:10.4f}{base_ll:10.4f}")
    print(f"{'lightgbm':10}{acc:10.4f}{ll:10.4f}")
    print(f"\np-value (model hơn baseline do may mắn): {p_value:.4f}")

    # Nếu chỉ phát dự đoán khi đủ tự tin
    print(f"\n{'ngưỡng':>8}{'tỉ lệ phát':>12}{'accuracy':>10}")
    conf = proba.max(1)
    for thr in [0.0, 0.5, 0.55, 0.6, 0.65, 0.7]:
        m = conf >= thr
        if m.sum() >= 30:
            print(f"{thr:8.2f}{m.mean():12.1%}{accuracy_score(y_te[m], pred[m]):10.4f}")

    # Feature nào đóng góp nhiều nhất
    imp = sorted(zip(feats, model.feature_importances_), key=lambda x: -x[1])[:10]
    print("\nTop feature:", ", ".join(f"{f}={v}" for f, v in imp))

    # Lưu model kèm mọi thứ cần để dự đoán sau này
    Path("models").mkdir(exist_ok=True)
    meta = {
        "trained_at": datetime.now(timezone.utc).isoformat(),
        "n_train": len(tr), "n_test": len(te),
        "classes": classes, "features": feats,
        "metrics": {"acc": acc, "log_loss": ll, "base_acc": base_acc, "base_ll": base_ll, "p_value": p_value},
    }
    joblib.dump({"model": model, **meta}, "models/model.joblib")
    Path("models/model.json").write_text(json.dumps(meta, indent=2, ensure_ascii=False, default=str))
    print("\nĐã lưu models/model.joblib")

if __name__ == "__main__":
    main()