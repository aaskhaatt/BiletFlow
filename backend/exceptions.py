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

class PaidTicketsNotAvailableError(Exception):
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
