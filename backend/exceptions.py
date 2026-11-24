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

class InvalidImageError(Exception):
    pass

class ImageTooLargeError(Exception):
    pass

class StorageNotConfiguredError(Exception):
    pass

class StorageUnavailableError(Exception):
    pass

class TicketNotPrintableError(Exception):
    pass

class CampaignNotFoundError(Exception):
    pass

class InvalidCampaignError(Exception):
    pass

class PromoCodeAlreadyExistsError(Exception):
    pass

class PromoCodeNotFoundError(Exception):
    pass

class PromoCodeNotActiveError(Exception):
    pass

class PromoCodeUsedUpError(Exception):
    pass

class PromoCodeNotApplicableError(Exception):
    pass

class CampaignLinkNotFoundError(Exception):
    pass
