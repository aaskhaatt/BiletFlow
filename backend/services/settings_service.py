from sqlalchemy.orm import Session
from repositories.settings_repository import get_setting, upsert_setting
from services.audit_service import log_action

ACTIVATION_FEE_KEY = "activation_fee_kzt"
# used until a platform admin sets a fee; the SRS leaves the real amount to be decided
DEFAULT_ACTIVATION_FEE_KZT = 5000


def get_activation_fee(db: Session) -> int:
    value = get_setting(ACTIVATION_FEE_KEY, db)

    return int(value) if value is not None else DEFAULT_ACTIVATION_FEE_KZT


def get_settings_service(db: Session):
    return {"activation_fee_kzt": get_activation_fee(db)}


def set_activation_fee_service(admin_user_id: int, amount_kzt: int, db: Session):
    old_amount = get_activation_fee(db)
    upsert_setting(ACTIVATION_FEE_KEY, str(amount_kzt), db)
    log_action(db, admin_user_id, "settings.activation_fee_updated", "platform_setting", None,
               f"Activation fee {old_amount} -> {amount_kzt} KZT")
    db.commit()

    return get_settings_service(db)
