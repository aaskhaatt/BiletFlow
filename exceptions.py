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