# apps/ai/src/patterns/contract.py
# Phải khớp packages/shared/src/ai.ts (sửa một bên thì sửa bên kia trong cùng commit).
#
# Mỗi entry của stream có đúng một field `payload` = JSON của message.
# Luồng: API -> predict:requests -> AI -> predict:results -> API; API -> ai:results -> AI (cập nhật bảng đếm).
import uuid
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict

SCHEMA_VERSION = 1

PREDICT_REQUEST_STREAM = "predict:requests"   # API ghi, AI đọc
AI_RESULT_STREAM = "ai:results"               # API ghi, AI đọc
PREDICT_RESULT_STREAM = "predict:results"     # AI ghi, API đọc
STREAM_MAXLEN = 10_000                        # XADD MAXLEN ~ cho cả 3 stream

AI_COUNTER_GROUP = "ai-counter"               # AI, trên ai:results
AI_PREDICTOR_GROUP = "ai-predictor"           # AI, trên predict:requests

MODEL_VERSION = "pattern-v1"
# Namespace UUIDv5 của prediction_id = uuid5(PREDICTION_NAMESPACE, game_session_id). Không đổi.
PREDICTION_NAMESPACE = uuid.UUID("d2ce63e1-76f4-498d-b5c7-67718f2a7f29")

Outcome = Literal["B", "P", "T"]
Pick = Literal["B", "P"]
Reason = Literal["OK", "NOT_ENOUGH_HISTORY", "NO_ELIGIBLE_SUFFIX"]


# Redis key. API sở hữu (ghi): round_status, recent. AI sở hữu (ghi): ai_counts, ai_counted.
def round_status_key(game_session_id: str) -> str: return f"round_status:{game_session_id}"
def recent_key(stream_id: str, shoe: int) -> str: return f"recent:{stream_id}:{shoe}"
def ai_counts_key(stream_id: str) -> str: return f"ai:counts:{stream_id}"
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
    shoe: int
    round: int
    result: Outcome
    received_at: str


class PatternRow(BaseModel):
    """Một đuôi k đã xét. pct_* = None khi total = 0."""
    k: int
    pattern: str
    count_B: int
    count_P: int
    total: int
    pct_B: Optional[float]
    pct_P: Optional[float]
    eligible: bool                # total >= 3 và count_B != count_P


class ChosenPattern(BaseModel):
    k: int
    pattern: str
    occurrences: int              # = total của đuôi được chọn
    pct_B: float
    pct_P: float


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
    history_used: str             # chuỗi B/P (đã bỏ T), tối đa 10 ký tự gần nhất
    missing_previous: bool
    reason: Reason
    model_version: str
    created_at: str
