# apps/ai/src/patterns/contract.py
# Phải khớp packages/shared/src/ai.ts (sửa một bên thì sửa bên kia trong cùng commit).
#
# Mỗi entry của stream có đúng một field `payload` = JSON của message.
# Luồng: API -> predict:requests -> AI -> predict:results -> API; API -> ai:results -> AI (cập nhật bảng đếm).
import uuid
from typing import Annotated, Literal, Optional

from pydantic import BaseModel, ConfigDict, StringConstraints

SCHEMA_VERSION = 1

PREDICT_REQUEST_STREAM = "predict:requests"   # API ghi, AI đọc
AI_RESULT_STREAM = "ai:results"               # API ghi, AI đọc
PREDICT_RESULT_STREAM = "predict:results"     # AI ghi, API đọc
STREAM_MAXLEN = 10_000                        # XADD MAXLEN ~ cho cả 3 stream

# Pub/Sub (không phải stream): API publish sau khi CLEAR_HISTORY xóa ván; AI nghe và dựng lại bảng đếm (không restart).
# Phải khớp AI_REBUILD_CHANNEL ở packages/shared/src/ai.ts.
AI_REBUILD_CHANNEL = "ai:rebuild"

AI_COUNTER_GROUP = "ai-counter"               # AI, trên ai:results
AI_PREDICTOR_GROUP = "ai-predictor"           # AI, trên predict:requests

MODEL_VERSION = "pattern-v1"
# Namespace UUIDv5 của prediction_id = uuid5(PREDICTION_NAMESPACE, game_session_id). Không đổi.
PREDICTION_NAMESPACE = uuid.UUID("d2ce63e1-76f4-498d-b5c7-67718f2a7f29")

# Ký hiệu kết quả / pick: đúng MỘT chữ in hoa (^[A-Z]$); tập hợp lệ của từng category nằm ở config/categories/*.json.
Symbol = Annotated[str, StringConstraints(pattern=r"^[A-Z]$")]
Outcome = Symbol
Pick = Symbol
Reason = Literal["OK", "NOT_ENOUGH_HISTORY", "NO_ELIGIBLE_SUFFIX"]


# Redis key. API sở hữu (ghi): round_status, recent. AI sở hữu (ghi): ai_counts, ai_wcounts (+ theo shoe), ai_counted.
def round_status_key(game_session_id: str) -> str: return f"round_status:{game_session_id}"
def recent_key(stream_id: str, shoe: int) -> str: return f"recent:{stream_id}:{shoe}"
def ai_counts_key(stream_id: str) -> str: return f"ai:counts:{stream_id}"
# HASH như ai:counts nhưng số đếm CÓ trọng số theo độ mới (float, tính từ mốc t0 của lần dựng lại); chỉ AI dùng.
def ai_wcounts_key(stream_id: str) -> str: return f"ai:wcounts:{stream_id}"
# HASH {t0, half_life_minutes}: mốc t0 và bán rã mà ai:wcounts* đang dùng ('' = tắt trọng số). Đổi CÙNG LÚC với các bảng (MULTI/EXEC) nên đọc
# trong cùng transaction với bảng thì luôn khớp; script Lua đếm cũng đọc nó để tính trọng số.
AI_WSTATE_KEY = "ai:wstate"
def ai_shoe_wcounts_key(stream_id: str, shoe: int) -> str: return f"ai:wcounts:{stream_id}:{shoe}"   # chỉ shoe này, có TTL
def ai_counted_key(stream_id: str, shoe: int) -> str: return f"ai:counted:{stream_id}:{shoe}"


def prediction_id(game_session_id: str) -> str:
    """Cùng ván luôn ra cùng ID (khớp predictionId() bên api)."""
    return str(uuid.uuid5(PREDICTION_NAMESPACE, game_session_id))


class _Msg(BaseModel):
    model_config = ConfigDict(extra="ignore")
    schema_version: Literal[1]


class PredictRequest(_Msg):
    """API -> AI: có ván mới cần dự đoán."""
    game_session_id: str
    stream_id: str
    key_id: str
    shoe: int
    round: int
    requested_at: str


class AiResult(_Msg):
    """API -> AI: ván vừa có kết quả (chỉ XADD lần đầu có kết quả của ván)."""
    game_session_id: str
    stream_id: str
    key_id: str                   # để AI tra cấu hình category (ignore_in_pattern / predictable)
    shoe: int
    round: int
    result: Outcome
    received_at: str


class PatternRow(BaseModel):
    """Một đuôi k đã xét. Khóa của counts / pct = các ký hiệu `predictable` của category; pct[x] = None khi total = 0.

    counts / total là số CÓ trọng số theo độ mới (đã gồm hệ số shoe hiện tại, "lần hiệu dụng": một kết quả vừa xảy ra = 1);
    KHÔNG chứa số lần thật. Khi tắt trọng số (half_life_minutes = None) chúng chính là số lần thật."""
    k: int
    pattern: str                  # chuỗi ký hiệu nối liền (vd "BPBP")
    counts: dict[str, float]
    pct: dict[str, Optional[float]]
    total: float                  # = tổng counts (tổng trọng số)
    eligible: bool                # số lần THẬT >= 3 và ký hiệu nhiều nhất (theo số có trọng số) là duy nhất


class ChosenPattern(BaseModel):
    k: int
    pattern: str
    occurrences: float            # = total (tổng trọng số) của đuôi được chọn
    pct: dict[str, float]         # cùng khóa với counts của PatternRow


class PredictResult(_Msg):
    """AI -> API: kết quả dự đoán."""
    prediction_id: str
    game_session_id: str
    stream_id: str
    key_id: str                   # chép từ PredictRequest, để API đẩy SSE đúng phòng
    shoe: int
    round: int
    pick: Optional[Pick]
    confidence: Optional[float]   # tỉ lệ của pick, 0-1
    chosen: Optional[ChosenPattern]
    detail: list[PatternRow]
    history_used: str             # chuỗi ký hiệu (đã bỏ ignore_in_pattern), tối đa 10 ký tự gần nhất
    missing_previous: bool
    half_life_minutes: Optional[int]   # bán rã trọng số theo độ mới đã dùng; None = tắt (đúng pattern-v1)
    shoe_weight: Optional[int]         # hệ số shoe hiện tại đã dùng; None khi tắt trọng số
    reason: Reason
    model_version: str
    created_at: str
