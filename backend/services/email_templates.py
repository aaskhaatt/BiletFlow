"""Subject and plain-text body for every EMAIL_TEMPLATES key (SRS 4.10).

`{placeholders}` come from the email's `data`, plus `{app_url}` (the web app's address, FRONTEND_URL).
shortcut: English only; add kk/ru versions here when localization (Phase 3) starts.
"""
import os

APP_URL = os.getenv("FRONTEND_URL", "http://localhost:5173").rstrip("/")

TEMPLATES = {
    "verify_email": (
        "Confirm your BiletFlow email",
        "Welcome to BiletFlow!\n\nConfirm your email address by opening this link:\n"
        "{app_url}/verify-email?token={token}\n\nThe link works until {expires_at}. "
        "If you didn't create an account, ignore this email.",
    ),
    "password_reset": (
        "Reset your BiletFlow password",
        "Someone asked to reset the password of your BiletFlow account.\n\nChoose a new password here:\n"
        "{app_url}/reset-password?token={token}\n\nThe link works once, until {expires_at}. "
        "If it wasn't you, ignore this email; your password stays the same.",
    ),
    "order_confirmed": (
        "Your tickets for {event_title}",
        "Your order #{order_id} for {event_title} is confirmed.\n\n"
        "Your tickets and their QR codes are here:\n{app_url}/orders/{order_id}\n\nSee you at the event!",
    ),
    "payment_failed": (
        "Payment failed for {event_title}",
        "The payment of {amount} KZT for order #{order_id} ({event_title}) didn't go through. "
        "This is a simulated demo payment; no real money was charged.\n\n"
        "You can try again while your tickets are on hold:\n{app_url}/orders/{order_id}",
    ),
    "order_cancelled": (
        "Order #{order_id} was cancelled",
        "Your order #{order_id} for {event_title} was cancelled.\nReason: {reason}\n\n"
        "Its tickets no longer admit anyone.",
    ),
    "order_refunded": (
        "Refund for {event_title}",
        "Order #{order_id} for {event_title} was refunded: {amount} KZT (simulated demo refund).\n"
        "Reason: {reason}\n\nIts tickets no longer admit anyone.",
    ),
    "event_updated": (
        "{event_title} has changed",
        "The organizer updated {event_title}:\n{changes}\n\nEvent page: {app_url}/events/{event_id}",
    ),
    "event_cancelled": (
        "{event_title} is cancelled",
        "Unfortunately {event_title} has been cancelled by the organizer.\n"
        "Paid orders are refunded automatically (simulated demo refund).\n\n{app_url}/events/{event_id}",
    ),
    "payout_status": (
        "Payout update for {event_title}",
        "The payout status for {event_title} is now: {status}.\n\n{app_url}/events/{event_id}",
    ),
    "support_message": (
        "New reply: {subject}",
        "There's a new reply in your support case \"{subject}\".\n\n{app_url}/support/{case_id}",
    ),
    "support_case_assigned": (
        "Support case assigned: {subject}",
        "The support case \"{subject}\" was assigned to you.\n\n{app_url}/support/{case_id}",
    ),
    "support_case_status_changed": (
        "Support case {status}: {subject}",
        "Your support case \"{subject}\" is now {status}.\n\n{app_url}/support/{case_id}",
    ),
}


def render_email(template: str, data: dict) -> tuple[str, str]:
    """Returns (subject, body). Raises KeyError if `data` lacks a placeholder the template needs."""
    subject, body = TEMPLATES[template]
    values = {**data, "app_url": APP_URL}
    return subject.format(**values), body.format(**values)
