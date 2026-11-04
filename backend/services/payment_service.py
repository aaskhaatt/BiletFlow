import secrets
from typing import Literal
from sqlalchemy.orm import Session
from repositories.payment_repository import create_payment

# The academic MVP moves no real money (SRS 3.2, 4.6). This function stands in for a real payment
# provider (Kaspi, Halyk, Stripe...). Swapping in a real one later only changes this file.
SimulatedOutcome = Literal["success", "failure"]


def simulate_payment(purpose: str, amount: int, outcome: SimulatedOutcome, payer_user_id: int, event_id: int,
                     db: Session, order_id: int | None = None):
    # the caller chooses the outcome, so the demo can show both the success and the "card declined" path
    succeeded = outcome == "success"

    return create_payment(
        purpose = purpose,
        amount = amount,
        status = "succeeded" if succeeded else "failed",
        # what a real provider would return as its transaction id; "SIM-" makes fake ones obvious
        provider_reference = "SIM-" + secrets.token_hex(8).upper(),
        failure_reason = None if succeeded else "Simulated card decline",
        payer_user_id = payer_user_id,
        event_id = event_id,
        order_id = order_id,
        db = db
    )
