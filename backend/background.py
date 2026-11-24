import asyncio
import logging
import os
from database import SessionLocal
from services.order_service import expire_overdue_orders_service
from services.email_service import send_due_emails

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


# --- email outbox sender (Dev B, Feature 7) ---------------------------------------------------
# main.py starts it only when SMTP_HOST is set, so tests and CI never try to reach a mail server
EMAIL_SEND_INTERVAL_SECONDS = float(os.getenv("EMAIL_SEND_INTERVAL_SECONDS", "5"))


def _send_emails_once():
    db = SessionLocal()
    try:
        sent = send_due_emails(db)
        if sent:
            logger.info("sent %s email(s)", sent)
    finally:
        db.close()


async def send_emails_forever():
    while True:
        await asyncio.sleep(EMAIL_SEND_INTERVAL_SECONDS)
        try:
            await asyncio.to_thread(_send_emails_once)
        except Exception:
            logger.exception("email sending failed")
