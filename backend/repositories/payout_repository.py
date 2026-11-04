from sqlalchemy.orm import Session
from sqlalchemy import select
from models import PayoutAccount



def get_payout_account_by_organizer_id(organizer_id: int, db: Session) -> PayoutAccount | None:
    stmt = select(PayoutAccount).where(PayoutAccount.organizer_id == organizer_id)

    return db.scalars(stmt).first()


def save_payout_account(organizer_id: int, holder_name: str, bank_name: str, iban_last4: str, db: Session):
    # one payout account per organizer: replace the details if it already exists
    account = get_payout_account_by_organizer_id(organizer_id, db)

    if account is None:
        account = PayoutAccount(organizer_id=organizer_id, holder_name=holder_name, bank_name=bank_name, iban_last4=iban_last4)
        db.add(account)
    else:
        account.holder_name = holder_name
        account.bank_name = bank_name
        account.iban_last4 = iban_last4

    db.flush()

    return account
