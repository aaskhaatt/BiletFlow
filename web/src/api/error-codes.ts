import { ApiError, CLIENT_ERROR_CODES } from '@/api/errors'

/**
 * Every `error` value the API can answer with: docs/api-reference.md, "Errors",
 * checked against ERRORS in backend/exception_handlers.py. Add new backend
 * errors here: the translations (src/i18n/locales) then fail to compile until
 * each language has a text.
 */
export const API_ERROR_CODES_BY_STATUS = {
  400: [
    'InvalidEventTimeError',
    'InvalidTicketSalesTimeError',
    'EventNotReadyToPublishError',
    'InvalidOrderQuantityError',
    'InvalidCampaignError',
    'InvalidAccountTokenError',
    'InvalidSupportAssigneeError',
    'CannotSuspendSelfError',
  ],
  401: [
    'InvalidCredentialsError',
    'InvalidRefreshTokenError',
    'NotAuthenticatedError',
    'InvalidTokenError',
  ],
  402: ['PaymentFailedError'],
  403: [
    'OrganizerNotApprovedError',
    'EventAccessDeniedError',
    'NotEventStaffError',
    'PlatformAdminRequiredError',
    'UserSuspendedError',
    'SupportCaseAccessDeniedError',
  ],
  404: [
    'UserNotFoundError',
    'OrganizerNotFoundError',
    'EventNotFoundError',
    'TicketTypeNotFoundError',
    'OrderNotFoundError',
    'TicketNotFoundError',
    'StaffAssignmentNotFoundError',
    'PaidSalesNotFoundError',
    'CampaignNotFoundError',
    'PromoCodeNotFoundError',
    'CampaignLinkNotFoundError',
    'SupportCaseNotFoundError',
    'EventReportNotFoundError',
    'NOT_FOUND',
  ],
  405: ['METHOD_NOT_ALLOWED'],
  409: [
    'UserAlreadyExistsError',
    'OrganizerProfileAlreadyExistsError',
    'InvalidEventStatusError',
    'InvalidOrganizerStatusError',
    'EventHasTicketsError',
    'EventAlreadyEndedError',
    'RegistrationClosedError',
    'TicketTypeNotAvailableError',
    'TicketTypeSoldOutError',
    'EventSoldOutError',
    'QuantityBelowSoldError',
    'StaffAlreadyAssignedError',
    'TicketNotCheckedInError',
    'PaidSalesNotActiveError',
    'ActivationRequirementsNotMetError',
    'ActivationFeeAlreadyPaidError',
    'InvalidActivationStatusError',
    'OrderNotPayableError',
    'OrderExpiredError',
    'OrderNotCancellableError',
    'OrderNotRefundableError',
    'TicketNotPrintableError',
    'PromoCodeAlreadyExistsError',
    'PromoCodeNotActiveError',
    'PromoCodeUsedUpError',
    'PromoCodeNotApplicableError',
    'EmailAlreadyVerifiedError',
    'EventAlreadyReportedError',
  ],
  413: ['ImageTooLargeError'],
  415: ['InvalidImageError'],
  422: ['VALIDATION_ERROR'],
  503: ['StorageNotConfiguredError', 'StorageUnavailableError', 'DatabaseUnavailableError'],
} as const

type ServerErrorCode =
  (typeof API_ERROR_CODES_BY_STATUS)[keyof typeof API_ERROR_CODES_BY_STATUS][number]
type ClientErrorCode = (typeof CLIENT_ERROR_CODES)[keyof typeof CLIENT_ERROR_CODES]

/** A code that has a translated text: errors.<code> in every language. */
export type ErrorCode = ServerErrorCode | ClientErrorCode

export const ERROR_CODES: readonly ErrorCode[] = [
  ...Object.values(API_ERROR_CODES_BY_STATUS).flat(),
  ...Object.values(CLIENT_ERROR_CODES),
]

const known = new Set<string>(ERROR_CODES)

export function isErrorCode(value: string): value is ErrorCode {
  return known.has(value)
}

/** The code to show for any failure. Unknown codes and non-API errors become UNKNOWN_ERROR. */
export function errorCodeOf(error: unknown): ErrorCode {
  if (error instanceof ApiError && isErrorCode(error.error)) return error.error
  return CLIENT_ERROR_CODES.unknown
}

/** The translation key for a failure: t(errorMessageKey(error)). Never the server's message. */
export function errorMessageKey(error: unknown): `errors.${ErrorCode}` {
  return `errors.${errorCodeOf(error)}`
}
