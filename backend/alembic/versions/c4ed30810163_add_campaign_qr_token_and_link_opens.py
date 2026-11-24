"""add campaign qr token and link opens

Revision ID: c4ed30810163
Revises: a0c0c4829cb1
Create Date: 2026-11-24 23:14:14.158966

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c4ed30810163'
down_revision: Union[str, Sequence[str], None] = 'a0c0c4829cb1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # campaigns may already exist, so qr_token is added in three steps instead of as NOT NULL at once:
    # 1. add it empty, 2. give every existing campaign its own random token, 3. then require it
    op.add_column('promo_campaigns', sa.Column('qr_token', sa.String(), nullable=True))
    op.execute("UPDATE promo_campaigns SET qr_token = 'C-' || replace(gen_random_uuid()::text, '-', '') WHERE qr_token IS NULL")
    op.alter_column('promo_campaigns', 'qr_token', nullable=False)
    op.create_unique_constraint('promo_campaigns_qr_token_key', 'promo_campaigns', ['qr_token'])
    op.add_column('promo_campaigns', sa.Column('link_opens', sa.Integer(), server_default='0', nullable=False))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('promo_campaigns', 'link_opens')
    op.drop_constraint('promo_campaigns_qr_token_key', 'promo_campaigns', type_='unique')
    op.drop_column('promo_campaigns', 'qr_token')
