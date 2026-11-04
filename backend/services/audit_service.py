from sqlalchemy.orm import Session
from repositories.audit_repository import create_audit_log


def log_action(db: Session, actor_user_id: int | None, action: str, entity_type: str,
               entity_id: int | None, description: str, event_id: int | None = None):
    create_audit_log(actor_user_id, event_id, action, entity_type, entity_id, description, db)
