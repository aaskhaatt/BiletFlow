from models import AuditLog
from sqlalchemy.orm import Session


def create_audit_log(actor_user_id: int | None, event_id: int | None, 
                     action: str, entity_type: str, entity_id: int | None, description: str, db: Session):
    new_audit = AuditLog(
        actor_user_id = actor_user_id,
        event_id = event_id,
        action = action,
        entity_type = entity_type,
        entity_id = entity_id,
        description = description
    )

    db.add(new_audit)
    db.flush()