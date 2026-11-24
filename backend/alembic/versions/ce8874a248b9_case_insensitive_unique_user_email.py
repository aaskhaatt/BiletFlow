"""case insensitive unique user email

Revision ID: ce8874a248b9
Revises: af3060d15bd6
Create Date: 2026-11-24 12:12:09.174308

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'ce8874a248b9'
down_revision: Union[str, Sequence[str], None] = 'af3060d15bd6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Lowercase every email, then make emails unique regardless of case."""
    conn = op.get_bind()

    # Two accounts that differ only in case can't both survive. Deleting one would lose its orders,
    # so stop and let a person decide which account to keep.
    duplicates = conn.execute(sa.text(
        "select lower(email) from users group by lower(email) having count(*) > 1"
    )).scalars().all()
    if duplicates:
        raise RuntimeError(
            "These emails belong to several accounts that differ only in letter case: "
            + ", ".join(duplicates)
            + ". Delete or rename the extra accounts, then run the migration again."
        )

    op.execute("update users set email = lower(email) where email <> lower(email)")
    op.drop_constraint(op.f('users_email_key'), 'users', type_='unique')
    op.create_index('ux_users_email_lower', 'users', [sa.literal_column('lower(email)')], unique=True)


def downgrade() -> None:
    """Back to a plain unique constraint. Emails stay lowercase; the original capitals are gone."""
    op.drop_index('ux_users_email_lower', table_name='users')
    op.create_unique_constraint(op.f('users_email_key'), 'users', ['email'], postgresql_nulls_not_distinct=False)
