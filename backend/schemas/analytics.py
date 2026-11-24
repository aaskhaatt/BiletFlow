from datetime import date, datetime
from pydantic import BaseModel


class AnalyticsFilters(BaseModel):
    date_from: datetime | None
    date_to: datetime | None
    ticket_type_id: int | None


class CapacityStats(BaseModel):
    # right now, not limited by the dates. With ticket_type_id: that type's numbers
    capacity: int | None        # null = no limit set anywhere
    sold: int                   # valid tickets issued (paid or free), used or not
    held: int                   # seats in checkouts still being paid
    remaining: int | None
    percent_sold: float | None  # sold / capacity, one decimal


class MoneyStats(BaseModel):
    # orders sold in the period. Same definitions as GET /events/{id}/sales, so without dates both agree.
    # Counted per order, so the ticket_type_id filter doesn't change these (a discount covers the whole order).
    gross: int                  # money collected, after discounts (refunded orders included: collected once)
    discounts: int              # promo discounts on paid orders
    refunds: int
    processing_fees: int
    net: int                    # gross - refunds - fees: the organizer's estimated payout
    paid_orders: int


class CheckInStats(BaseModel):
    # right now; with ticket_type_id, that type only
    tickets: int                # valid tickets (used or not)
    checked_in: int
    percent: float | None


class DailySales(BaseModel):
    date: date                  # Kazakhstan time (UTC+5)
    orders: int
    tickets: int
    # after discounts; with ticket_type_id: that type's tickets at their price
    revenue: int


class TicketTypeAnalytics(BaseModel):
    ticket_type_id: int
    name: str
    price: int
    quantity: int
    sold: int                   # in the period
    revenue: int                # in the period, at the price paid (before order discounts)
    held: int                   # right now
    checked_in: int             # right now


class CampaignAnalytics(BaseModel):
    campaign_id: int
    code: str
    name: str
    is_active: bool
    link_opens: int
    # paid orders that used the code, in the period
    orders: int
    tickets: int
    gross: int
    discount: int
    net: int


class EventAnalyticsResponse(BaseModel):
    event_id: int
    currency: str
    is_simulated: bool
    filters: AnalyticsFilters
    capacity: CapacityStats
    money: MoneyStats
    check_in: CheckInStats
    sales_over_time: list[DailySales]
    ticket_types: list[TicketTypeAnalytics]
    campaigns: list[CampaignAnalytics]
