from sqlalchemy.orm import Session
from sqlalchemy.dialects.postgresql import insert
from models import PlatformSetting



def get_setting(key: str, db: Session) -> str | None:
    setting = db.get(PlatformSetting, key)

    return setting.value if setting is not None else None


def upsert_setting(key: str, value: str, db: Session):
    # "upsert" = insert, or update if the key already exists, in ONE statement:
    # INSERT ... ON CONFLICT (key) DO UPDATE SET value = ...
    stmt = (
        insert(PlatformSetting)
        .values(key=key, value=value)
        .on_conflict_do_update(index_elements=[PlatformSetting.key], set_={"value": value})
    )

    db.execute(stmt)
