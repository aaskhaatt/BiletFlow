import re
from pydantic import ConfigDict, BaseModel, Field, field_validator
from datetime import datetime

class OrganizerResponse(BaseModel):
    model_config = ConfigDict(from_attributes = True)

    id: int
    user_id: int
    status: str


class IdentityVerificationRequest(BaseModel):
    legal_name: str = Field(min_length=2, max_length=200)
    contact_phone: str

    @field_validator("contact_phone")
    @classmethod
    def check_kz_phone(cls, value: str) -> str:
        # accept "+7 701 123 45 67", "+7(701)123-45-67", ... and store one normal form: +77011234567
        phone = re.sub(r"[\s()\-]", "", value)
        if not re.fullmatch(r"\+7\d{10}", phone):
            raise ValueError("must be a Kazakhstan phone number like +7 701 123 45 67")
        return phone


class PayoutAccountRequest(BaseModel):
    holder_name: str = Field(min_length=2, max_length=200)
    bank_name: str = Field(min_length=2, max_length=100)
    # the full IBAN is only checked here; just its last 4 characters are ever saved
    iban: str

    @field_validator("iban")
    @classmethod
    def check_kz_iban(cls, value: str) -> str:
        # Kazakhstan IBANs: "KZ" + 2 check digits + 16 letters/digits = 20 characters
        iban = value.replace(" ", "").upper()
        if not re.fullmatch(r"KZ\d{2}[A-Z0-9]{16}", iban):
            raise ValueError("must be a Kazakhstan IBAN like KZ86 125K ZT50 0410 0100")
        return iban


class PayoutAccountResponse(BaseModel):
    model_config = ConfigDict(from_attributes = True)

    holder_name: str
    bank_name: str
    iban_last4: str
    is_simulated: bool


class OrganizerProfileResponse(BaseModel):
    model_config = ConfigDict(from_attributes = True)

    id: int
    user_id: int
    status: str
    legal_name: str | None
    contact_phone: str | None
    identity_verified_at: datetime | None
    payout_account: PayoutAccountResponse | None
