"""
scheduler.py — APScheduler による週次通知スケジューラー (D-1)

Config の notify_time（HH:MM 形式）を読んで、毎日その時刻に send_weekly_summary を実行する。
notify_time が変更された場合は、アプリ再起動で反映される。

APScheduler がインストールされていない場合は graceful に無効化する。
"""
import logging
from typing import Any

logger = logging.getLogger("scheduler")

try:
    from apscheduler.schedulers.asyncio import AsyncIOScheduler
    from apscheduler.triggers.cron import CronTrigger
    _HAS_APSCHEDULER = True
except ImportError:
    _HAS_APSCHEDULER = False
    logger.warning(
        "APScheduler がインストールされていません。"
        "週次メール通知は無効です。"
        "pip install apscheduler でインストールしてください。"
    )

_scheduler: Any = None


def start_scheduler(notify_time: str = "08:00") -> None:
    """スケジューラーを起動する。FastAPI lifespan から呼ばれる。"""
    global _scheduler
    if not _HAS_APSCHEDULER:
        return

    try:
        hour, minute = notify_time.split(":")
        hour   = int(hour)
        minute = int(minute)
    except Exception:
        logger.error(f"notify_time の形式が不正です: {notify_time!r}。デフォルト 08:00 を使用します。")
        hour, minute = 8, 0

    from app.notify import send_weekly_summary

    _scheduler = AsyncIOScheduler()
    _scheduler.add_job(
        send_weekly_summary,
        trigger=CronTrigger(hour=hour, minute=minute, timezone="Asia/Tokyo"),
        id="weekly_summary",
        replace_existing=True,
    )
    _scheduler.start()
    logger.info(f"週次サマリースケジューラーを起動しました (毎日 {hour:02d}:{minute:02d} JST)")


def stop_scheduler() -> None:
    """スケジューラーを停止する。FastAPI shutdown から呼ばれる。"""
    global _scheduler
    if _scheduler and _HAS_APSCHEDULER:
        try:
            _scheduler.shutdown(wait=False)
            logger.info("スケジューラーを停止しました。")
        except Exception as ex:
            logger.error(f"スケジューラー停止エラー: {ex}")
        _scheduler = None
