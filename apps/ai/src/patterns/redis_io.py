# src/patterns/redis_io.py
# Đọc Redis Stream theo consumer group: đọc PEL ("0") trước rồi mới tin mới (">"), XACK sau khi xử lý xong.
import asyncio
import json
import logging
from typing import Awaitable, Callable, TypeVar

import redis.asyncio as aioredis
from pydantic import BaseModel, ValidationError

from .config import BLOCK_MS, READ_COUNT, RETRY_DELAY_S

log = logging.getLogger("pattern")
M = TypeVar("M", bound=BaseModel)


async def ensure_group(r: aioredis.Redis, stream: str, group: str) -> None:
    """Tạo group ở "$" (chỉ nhận tin mới). Tạo ở "0" sẽ replay cả lịch sử stream."""
    try:
        await r.xgroup_create(stream, group, id="$", mkstream=True)
    except aioredis.ResponseError as e:
        if "BUSYGROUP" not in str(e):
            raise


async def consume(
    r: aioredis.Redis, stream: str, group: str, consumer: str, model: type[M],
    handler: Callable[[M], Awaitable[None]], stop: asyncio.Event, concurrency: int = 1,
) -> None:
    """Gọi handler cho từng message (tối đa `concurrency` message song song).

    - Message hỏng (JSON/schema sai): log ERROR, XACK, bỏ qua.
    - handler ném lỗi khác (vd Redis lỗi): KHÔNG ack, chờ rồi đọc lại PEL.
    """
    sem = asyncio.Semaphore(concurrency)
    cursor, replaying = "0", True

    async def run_one(entry_id: str, fields: dict) -> bool:
        try:
            msg = model.model_validate(json.loads(fields["payload"]))
        except (KeyError, ValueError, ValidationError) as e:
            log.error("%s: bỏ qua message %s không hợp lệ: %s", stream, entry_id, e)
            return True
        async with sem:
            try:
                await handler(msg)
            except Exception:
                log.exception("%s: lỗi khi xử lý message %s, sẽ thử lại", stream, entry_id)
                return False
        return True

    while not stop.is_set():
        try:
            res = await r.xreadgroup(group, consumer, {stream: cursor}, count=READ_COUNT, block=BLOCK_MS)
            entries = res[0][1] if res else []
            if replaying and not entries:
                replaying, cursor = False, ">"
                continue
            if not entries:
                continue
            oks = await asyncio.gather(*(run_one(i, f) for i, f in entries))
            done = [i for (i, _), ok in zip(entries, oks) if ok]
            if done:
                await r.xack(stream, group, *done)
            if replaying:
                cursor = entries[-1][0]
            if len(done) != len(entries):
                await asyncio.sleep(RETRY_DELAY_S)
                replaying, cursor = True, "0"     # tin chưa ack nằm trong PEL, không được giao lại qua ">"
        except asyncio.CancelledError:
            raise
        except Exception:
            log.exception("%s: lỗi đọc stream, thử lại", stream)
            await asyncio.sleep(RETRY_DELAY_S)
            replaying, cursor = True, "0"
