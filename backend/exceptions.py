class UserAlreadyExistsError(Exception):
    pass

class UserNotFoundError(Exception):
    pass

class InvalidCredentialsError(Exception):
    pass

class OrganizerProfileAlreadyExistsError(Exception):
    pass

class OrganizerNotFoundError(Exception):
    pass

class OrganizerNotApprovedError(Exception):
    pass

class EventNotFoundError(Exception):
    pass

class EventAccessDeniedError(Exception):
    pass

class InvalidEventTimeError(Exception):
    pass

class TicketTypeNotFoundError(Exception):
    pass

class InvalidTicketSalesTimeError(Exception):
    pass

class InvalidRefreshTokenError(Exception):
    pass

# --- Dev B: email verification and password reset (Feature 7) ---
class InvalidAccountTokenError(Exception):
    pass

class EmailAlreadyVerifiedError(Exception):
    pass

# support cases (Feature 10)
class SupportCaseNotFoundError(Exception):
    pass

class SupportCaseAccessDeniedError(Exception):
    pass

class InvalidSupportAssigneeError(Exception):
    pass

# admin tools (Feature 13)
class UserSuspendedError(Exception):
    pass

class CannotSuspendSelfError(Exception):
    pass
# --- end Dev B ---

class InvalidEventStatusError(Exception):
    pass

class EventNotReadyToPublishError(Exception):
    pass

class RegistrationClosedError(Exception):
    pass

class TicketTypeNotAvailableError(Exception):
    pass

class InvalidOrderQuantityError(Exception):
    pass

class TicketTypeSoldOutError(Exception):
    pass

class EventSoldOutError(Exception):
    pass

class OrderNotFoundError(Exception):
    pass

class TicketNotFoundError(Exception):
    pass

class QuantityBelowSoldError(Exception):
    pass

class StaffAlreadyAssignedError(Exception):
    pass

class StaffAssignmentNotFoundError(Exception):
    pass

class NotEventStaffError(Exception):
    pass

class TicketNotCheckedInError(Exception):
    pass

class PaidSalesNotActiveError(Exception):
    pass

class ActivationRequirementsNotMetError(Exception):
    pass

class ActivationFeeAlreadyPaidError(Exception):
    pass

class InvalidActivationStatusError(Exception):
    pass

class PaymentFailedError(Exception):
    pass

class PaidSalesNotFoundError(Exception):
    pass

class OrderNotPayableError(Exception):
    pass

class OrderExpiredError(Exception):
    pass

class OrderNotCancellableError(Exception):
    pass

class OrderNotRefundableError(Exception):
    pass
