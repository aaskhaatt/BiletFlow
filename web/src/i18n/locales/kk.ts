import type { Messages } from '@/i18n/messages'

// Kazakh. The texts need a check by a native speaker.

export const kk: Messages = {
  common: {
    close: 'Жабу',
    language: 'Тіл',
    toHome: 'Басты бетке',
  },
  dev: {
    greeting: 'BiletFlow-ға қош келдіңіз',
  },
  notFound: {
    title: 'Бет табылмады',
    text: 'Сілтеме ескірген немесе мекенжайда қате болуы мүмкін.',
  },
  routeError: {
    title: 'Бір қате кетті',
    text: 'Бетті жаңартыңыз. Қате қайталанса, қолдау қызметіне жазыңыз.',
  },
  validation: {
    invalid: 'Бұл өрісті тексеріңіз',
  },
  money: {
    free: 'Тегін',
  },
  time: {
    astanaZone: 'Астана уақыты (UTC+5)',
  },
  errors: {
    // 400
    InvalidEventTimeError: 'Іс-шара күндерін тексеріңіз: аяқталуы басталуынан кейін болуы керек.',
    InvalidTicketSalesTimeError: 'Билет сату күндерін тексеріңіз.',
    EventNotReadyToPublishError: 'Іс-шараны жариялау үшін өтетін орны мен мекенжайын көрсетіңіз.',
    InvalidOrderQuantityError: 'Мұндай санда билет тапсырыс беруге болмайды.',
    InvalidCampaignError: 'Науқан баптауларын тексеріңіз.',
    InvalidAccountTokenError: 'Сілтеме жарамсыз, мерзімі өткен немесе бұрын қолданылған.',
    InvalidSupportAssigneeError: 'Бұл пайдаланушы осы өтінішпен жұмыс істемейді.',
    CannotSuspendSelfError: 'Өз аккаунтыңызды бұғаттай алмайсыз.',
    // 401
    InvalidCredentialsError: 'Электрондық пошта немесе құпиясөз қате.',
    InvalidRefreshTokenError: 'Сеанс аяқталды. Қайта кіріңіз.',
    NotAuthenticatedError: 'Жалғастыру үшін жүйеге кіріңіз.',
    InvalidTokenError: 'Сеанс аяқталды. Қайта кіріңіз.',
    // 402
    PaymentFailedError: 'Төлем өтпеді. Қайталап көріңіз.',
    // 403
    OrganizerNotApprovedError: 'Ұйымдастырушы профиліңіз әлі мақұлданбаған.',
    EventAccessDeniedError: 'Бұл іс-шараға қолжетімділігіңіз жоқ.',
    NotEventStaffError: 'Сіз бұл іс-шараның қызметкері болып тағайындалмағансыз.',
    PlatformAdminRequiredError: 'Бұл тек платформа әкімшілеріне қолжетімді.',
    UserSuspendedError: 'Аккаунт бұғатталған.',
    SupportCaseAccessDeniedError: 'Мұны тек өтінішті қарайтындар ғана жасай алады.',
    // 404
    UserNotFoundError: 'Пайдаланушы табылмады.',
    OrganizerNotFoundError: 'Ұйымдастырушы профилі табылмады.',
    EventNotFoundError: 'Іс-шара табылмады немесе қолжетімсіз.',
    TicketTypeNotFoundError: 'Билет түрі табылмады.',
    OrderNotFoundError: 'Тапсырыс табылмады.',
    TicketNotFoundError: 'Билет табылмады.',
    StaffAssignmentNotFoundError: 'Бұл адам іс-шараға тағайындалмаған.',
    PaidSalesNotFoundError: 'Бұл іс-шара үшін ақылы сату бапталмаған.',
    CampaignNotFoundError: 'Науқан табылмады.',
    PromoCodeNotFoundError: 'Мұндай промокод жоқ.',
    CampaignLinkNotFoundError: 'Науқан сілтемесі жарамсыз.',
    SupportCaseNotFoundError: 'Өтініш табылмады.',
    EventReportNotFoundError: 'Шағым табылмады.',
    NOT_FOUND: 'Сұралған дерек табылмады.',
    // 405
    METHOD_NOT_ALLOWED: 'Бұл әрекет қолжетімсіз.',
    // 409
    UserAlreadyExistsError: 'Бұл поштамен тіркелген аккаунт бар.',
    OrganizerProfileAlreadyExistsError: 'Сіз ұйымдастырушы болуға өтінім беріп қойғансыз.',
    InvalidEventStatusError: 'Іс-шараның қазіргі мәртебесінде бұл әрекет қолжетімсіз.',
    RegistrationClosedError: 'Бұл іс-шараға тіркеу қазір жабық.',
    TicketTypeNotAvailableError: 'Бұл билет қазір сатылымда жоқ.',
    TicketTypeSoldOutError: 'Бұл түрдегі билеттер сатылып бітті.',
    EventSoldOutError: 'Іс-шараның барлық орны сатылып кетті.',
    QuantityBelowSoldError: 'Саны сатылған билеттерден аз бола алмайды.',
    StaffAlreadyAssignedError: 'Бұл пайдаланушы іс-шараға тағайындалып қойған.',
    TicketNotCheckedInError: 'Бұл билет бойынша кіру әлі белгіленбеген.',
    PaidSalesNotActiveError: 'Бұл іс-шара үшін ақылы сату әлі іске қосылмаған.',
    ActivationRequirementsNotMetError: 'Алдымен іске қосу тізіміндегі барлық қадамды орындаңыз.',
    ActivationFeeAlreadyPaidError: 'Іске қосу алымы төленіп қойған.',
    InvalidActivationStatusError: 'Ақылы сатудың қазіргі мәртебесінде бұл әрекет қолжетімсіз.',
    OrderNotPayableError: 'Бұл тапсырысты төлеу мүмкін емес.',
    OrderExpiredError: 'Төлеу уақыты өтіп кетті. Тапсырысты қайта рәсімдеңіз.',
    OrderNotCancellableError: 'Бұл тапсырысты болдырмау мүмкін емес.',
    OrderNotRefundableError: 'Бұл тапсырыс бойынша қаражатты қайтару мүмкін емес.',
    TicketNotPrintableError: 'Тек жарамды билетті басып шығаруға болады.',
    PromoCodeAlreadyExistsError: 'Бұл іс-шарада мұндай промокод бар.',
    PromoCodeNotActiveError: 'Промокод қазір әрекет етпейді.',
    PromoCodeUsedUpError: 'Промокодты пайдалану шегі таусылды.',
    PromoCodeNotApplicableError: 'Промокод таңдалған билеттерге қолданылмайды.',
    EmailAlreadyVerifiedError: 'Пошта расталып қойған.',
    EventAlreadyReportedError: 'Сіз бұл іс-шара туралы шағым жіберіп қойғансыз.',
    // 413, 415
    ImageTooLargeError: 'Сурет 5 МБ-тан үлкен.',
    InvalidImageError: 'JPEG, PNG немесе WebP суретін жүктеңіз.',
    // 422
    VALIDATION_ERROR: 'Белгіленген өрістерді тексеріңіз.',
    // 503
    StorageNotConfiguredError: 'Файл жүктеу қазір қолжетімсіз.',
    StorageUnavailableError: 'Файл қоймасы жауап бермей тұр. Кейінірек қайталап көріңіз.',
    DatabaseUnavailableError: 'Қызмет уақытша қолжетімсіз. Кейінірек қайталап көріңіз.',
    // made by the client
    NETWORK_ERROR: 'Серверге қосылу мүмкін емес. Интернетті тексеріп, қайталап көріңіз.',
    UNKNOWN_ERROR: 'Бір қате кетті. Қайталап көріңіз.',
  },
}
