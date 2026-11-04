import asyncio
import logging
import os
from database import SessionLocal
from services.order_service import expire_overdue_orders_service

logger = logging.getLogger("biletflow.background")

# how often abandoned checkout holds are released; tests set this to 1 second
SWEEP_INTERVAL_SECONDS = float(os.getenv("ORDER_SWEEP_INTERVAL_SECONDS", "60"))


def _sweep_once():
    db = SessionLocal()
    try:
        released = expire_overdue_orders_service(db)
        if released:
            logger.info("released %s expired checkout hold(s)", released)
    finally:
        db.close()


async def sweep_expired_orders_forever():
    # runs for the whole life of the server; the database work happens in a worker thread
    # so the server keeps answering requests meanwhile
    while True:
        await asyncio.sleep(SWEEP_INTERVAL_SECONDS)
        try:
            await asyncio.to_thread(_sweep_once)
        except Exception:
            # one failed sweep (e.g. database briefly down) must not stop all future sweeps
            logger.exception("expired order sweep failed")
