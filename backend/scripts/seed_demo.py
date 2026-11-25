"""Fills the database with a ready-to-present demo, in one command.

    python scripts/seed_demo.py            # from backend/, venv active, migrations applied
    python scripts/seed_demo.py --reset    # delete the previous demo data first, then seed again
    python scripts/seed_demo.py --clear    # only delete the demo data

Everything goes through the real service functions (registration, events, orders, payments, refunds, check-in),
so the demo obeys the same rules as real use: inventory, fees, promo limits and the audit log.

Creates: an admin, an approved organizer, a check-in staff member, 10 attendees and 4 events:
  * Astana Jazz Night   paid, upcoming: activated sales, 2 promo codes, paid orders spread over 10 days, a refund
  * Almaty Tech Meetup  free, happening right now: registrations and live check-ins
  * Nauryz Fest         completed: past sales and check-ins, for analytics
  * Summer Open Air     a draft
All demo accounts share one password, DEMO_PASSWORD below. Emails use demo.example.com, a domain reserved for
examples, so no real person can ever receive anything.
"""
import argparse
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import urlparse

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import text  # noqa: E402
from database import SessionLocal, engine, DATABASE_URL  # noqa: E402
from exceptions import PaymentFailedError  # noqa: E402
from schemas.campaign import CampaignCreate  # noqa: E402
from schemas.event import EventCreate  # noqa: E402
from schemas.order import OrderCreate, OrderItemCreate  # noqa: E402
from schemas.ticket_type import TicketTypeCreate  # noqa: E402
from schemas.user import UserCreate  # noqa: E402
from services.auth_service import register_user_service  # noqa: E402
from services.campaign_service import create_campaign_service  # noqa: E402
from services.cancellation_service import refund_order_service  # noqa: E402
from services.check_in_service import check_in_service  # noqa: E402
from services.event_service import create_event_service, publish_event_service  # noqa: E402
from services.order_service import create_order_service, pay_order_service  # noqa: E402
from services.organizer_service import (apply_for_organizer_service, approve_organizer_service,  # noqa: E402
                                        verify_identity_service, set_payout_account_service)
from services.paid_sales_service import accept_terms_service, pay_activation_fee_service, activate_paid_sales_service  # noqa: E402
from services.staff_service import assign_staff_service  # noqa: E402
from services.ticket_type_service import create_ticket_type_service  # noqa: E402

DEMO_PASSWORD = "BiletFlow-demo-2026"
DEFAULT_DOMAIN = "demo.example.com"
LOCAL_HOSTS = {"localhost", "127.0.0.1", "::1", "postgres"}
KZ = timezone(timedelta(hours=5))

ATTENDEES = [("aigerim", "Aigerim Sadykova"), ("daniyar", "Daniyar Bekov"), ("aliya", "Әлия Нұрланқызы"),
             ("timur", "Timur Akhmetov"), ("madina", "Madina Seitkali"), ("yerlan", "Ерлан Жұмабаев"),
             ("dana", "Dana Omarova"), ("arman", "Arman Tulegenov"), ("saule", "Сәуле Қасымова"), ("nurlan", "Nurlan Abenov")]


def at(days: int, hour: int, minute: int = 0) -> datetime:
    """A moment `days` from today at a Kazakhstan clock time."""
    today = datetime.now(KZ).replace(hour=0, minute=0, second=0, microsecond=0)
    return today + timedelta(days=days, hours=hour, minutes=minute)


class Seeder:
    def __init__(self, db, domain: str):
        self.db, self.domain = db, domain
        self.now = datetime.now(timezone.utc)

    def email(self, name: str) -> str:
        return f"{name}@{self.domain}"

    def user(self, name: str):
        return register_user_service(UserCreate(email=self.email(name), password=DEMO_PASSWORD), self.db)

    def event(self, org, **fields) -> int:
        return create_event_service(org.id, EventCreate(**fields), self.db).id

    def ticket_type(self, org, event_id: int, name: str, price: int, quantity: int, sales_end: datetime, **extra) -> int:
        data = TicketTypeCreate(name=name, price=price, quantity=quantity, sales_start=self.now - timedelta(days=30),
                                sales_end=sales_end, **extra)
        return create_ticket_type_service(org.id, event_id, data, self.db).id

    def activate_paid_sales(self, org, event_id: int):
        accept_terms_service(org.id, event_id, self.db)
        pay_activation_fee_service(org.id, event_id, "success", self.db)
        activate_paid_sales_service(org.id, event_id, self.db)

    def order(self, user, event_id: int, buyer: str, items: list[tuple[int, int]], code: str | None = None,
              pay: bool = True):
        data = OrderCreate(buyer_name=buyer, promo_code=code,
                           items=[OrderItemCreate(ticket_type_id=i, quantity=q) for i, q in items])
        order = create_order_service(user, event_id, data, self.db)
        if pay and order.status == "pending":
            order = pay_order_service(user.id, order.id, "success", self.db)
        return order

    def sql(self, statement: str, **params):
        self.db.execute(text(statement), params)
        self.db.commit()


def reset(domain: str) -> int:
    """Deletes every demo account of this domain and everything they own."""
    pattern = f"%@{domain}"
    with engine.begin() as c:
        event_ids = c.execute(text(
            "select e.id from events e join organizer_profiles o on o.id = e.organizer_id "
            "join users u on u.id = o.user_id where u.email like :p"), {"p": pattern}).scalars().all()
        # audit rows only lose their links when events and users are deleted, so they go first:
        # the demo events' rows, and rows the demo accounts wrote outside any event (identity, payout account)
        c.execute(text("delete from audit_logs where event_id = any(:ids) or actor_user_id in "
                       "(select id from users where email like :p)"), {"ids": list(event_ids), "p": pattern})
        # emails queued for demo accounts (verification, order confirmations) aren't linked to users
        c.execute(text("delete from email_outbox where to_email like :p"), {"p": pattern})
        # deleting the users cascades to their organizer profile, events, ticket types, orders and tickets
        return c.execute(text("delete from users where email like :p"), {"p": pattern}).rowcount


def seed(domain: str) -> dict:
    db = SessionLocal()
    try:
        s = Seeder(db, domain)

        # --- people ------------------------------------------------------------------------------------
        admin = s.user("admin")
        s.sql("update users set is_platform_admin = true where id = :i", i=admin.id)
        org = s.user("organizer")
        apply_for_organizer_service(org.id, "Dala Events", db)
        approve_organizer_service(admin.id, org.id, db)
        verify_identity_service(org.id, "TOO Dala Events", "+77011234567", db)
        set_payout_account_service(org.id, "TOO Dala Events", "Halyk Bank", "KZ86125KZT5004100100", db)
        staff = s.user("staff")
        people = [(s.user(login), name) for login, name in ATTENDEES]
        # demo addresses can't receive the verification link, so the accounts start out verified
        s.sql("update users set email_verified_at = now() where email like :p", p=f"%@{domain}")

        # --- 1. a paid concert, upcoming, with promo codes ---------------------------------------------
        jazz = s.event(org, title="Astana Jazz Night", category="Music",
                       description="An evening of Kazakh and international jazz standards with the Astana Big Band.",
                       venue_name="Astana Opera, Chamber Hall", venue_address="Astana, Kunayev St 1", capacity=250,
                       start_time=at(12, 19), end_time=at(12, 22),
                       refund_policy="Full refund up to 7 days before the event.")
        standard = s.ticket_type(org, jazz, "Standard", 8000, 200, at(12, 18))
        vip = s.ticket_type(org, jazz, "VIP (front rows)", 25000, 30, at(12, 18), max_per_order=4)
        publish_event_service(org.id, jazz, db)
        s.activate_paid_sales(org, jazz)
        create_campaign_service(org.id, jazz, CampaignCreate(name="Instagram launch", code="JAZZ20",
                                                             discount_type="percent", discount_value=20,
                                                             max_redemptions=40), db)
        create_campaign_service(org.id, jazz, CampaignCreate(name="Students", code="STUDENT", discount_type="fixed",
                                                             discount_value=3000, ticket_type_ids=[standard]), db)
        jazz_orders = [
            s.order(people[0][0], jazz, people[0][1], [(standard, 2)], "JAZZ20"),
            s.order(people[1][0], jazz, people[1][1], [(vip, 2)]),
            s.order(people[2][0], jazz, people[2][1], [(standard, 1)], "STUDENT"),
            s.order(people[3][0], jazz, people[3][1], [(standard, 3)]),
            s.order(people[4][0], jazz, people[4][1], [(vip, 1), (standard, 1)], "JAZZ20"),
            s.order(people[5][0], jazz, people[5][1], [(standard, 2)]),
        ]
        # a declined card, then a successful retry: both attempts stay on record
        retry = s.order(people[6][0], jazz, people[6][1], [(standard, 1)], pay=False)
        try:
            pay_order_service(people[6][0].id, retry.id, "failure", db)
        except PaymentFailedError:
            pass
        jazz_orders.append(pay_order_service(people[6][0].id, retry.id, "success", db))
        refunded = s.order(people[7][0], jazz, people[7][1], [(vip, 1)])
        refund_order_service(org.id, refunded.id, "Attendee can't come: illness", db)
        # spread the payments over the last 10 days, so the analytics chart has a shape
        for days_ago, order in zip([10, 8, 7, 5, 3, 2, 1], jazz_orders):
            s.sql("update orders set paid_at = paid_at - make_interval(days => :d) where id = :i", d=days_ago, i=order.id)

        # --- 2. a free meetup, happening right now, with live check-ins -------------------------------
        meetup = s.event(org, title="Almaty Tech Meetup: AI in Production", category="Technology",
                         description="Three short talks on running AI systems in production, then networking.",
                         venue_name="Astana Hub, Hall B", venue_address="Almaty, Al-Farabi Ave 77",
                         capacity=120, start_time=s.now - timedelta(hours=1), end_time=s.now + timedelta(hours=2))
        entry = s.ticket_type(org, meetup, "Free entry", 0, 120, s.now + timedelta(hours=2))
        publish_event_service(org.id, meetup, db)
        assign_staff_service(org.id, meetup, s.email("staff"), db)
        meetup_orders = [s.order(user, meetup, name, [(entry, 1)]) for user, name in people[:7]]
        for order in meetup_orders[:4]:
            check_in_service(staff.id, meetup, order.tickets[0].code, db)

        # --- 3. a festival that already happened --------------------------------------------------------
        # created in the future (orders need open registration), then moved 20 days into the past
        fest = s.event(org, title="Nauryz Fest", category="Festival",
                       description="Spring festival with music, kokpar demonstrations and a dastarkhan.",
                       venue_name="Central Park", venue_address="Almaty, Gogol St 1", capacity=500,
                       start_time=at(1, 11), end_time=at(1, 20))
        adult = s.ticket_type(org, fest, "Adult", 3000, 400, at(1, 10))
        kids = s.ticket_type(org, fest, "Children (free)", 0, 100, at(1, 10))
        publish_event_service(org.id, fest, db)
        s.activate_paid_sales(org, fest)
        assign_staff_service(org.id, fest, s.email("staff"), db)
        fest_orders = [s.order(user, fest, name, [(adult, 2), (kids, 1)] if i % 2 else [(adult, 1)])
                       for i, (user, name) in enumerate(people)]
        for order in fest_orders[:8]:
            for ticket in order.tickets:
                check_in_service(staff.id, fest, ticket.code, db)
        shift = "make_interval(days => 21)"
        s.sql(f"update events set start_time = start_time - {shift}, end_time = end_time - {shift} where id = :i", i=fest)
        s.sql(f"update ticket_types set sales_start = sales_start - {shift}, sales_end = sales_end - {shift} where event_id = :i", i=fest)
        s.sql(f"update orders set created_at = created_at - {shift}, paid_at = paid_at - {shift} where event_id = :i", i=fest)
        s.sql(f"update tickets set created_at = created_at - {shift}, checked_in_at = checked_in_at - {shift} where event_id = :i", i=fest)

        # --- 4. a draft ----------------------------------------------------------------------------------
        draft = s.event(org, title="Summer Open Air (draft)", category="Music",
                        venue_name="Medeu", venue_address="Almaty, Medeu", start_time=at(60, 18), end_time=at(60, 23))
        s.ticket_type(org, draft, "Early bird", 6000, 300, at(60, 17))

        return {"jazz": jazz, "meetup": meetup, "fest": fest, "draft": draft}
    finally:
        db.close()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--reset", action="store_true", help="delete the previous demo data first")
    parser.add_argument("--clear", action="store_true", help="only delete the demo data, don't seed")
    parser.add_argument("--domain", default=DEFAULT_DOMAIN, help="email domain of the demo accounts")
    parser.add_argument("--allow-remote", action="store_true", help="allow a database that isn't on this machine")
    args = parser.parse_args()

    host = urlparse(DATABASE_URL).hostname
    if host not in LOCAL_HOSTS and not args.allow_remote:
        print(f"Refusing to seed the database on {host!r}: it isn't local. Add --allow-remote if that's intended.")
        return 1

    if args.reset or args.clear:
        print(f"Removed {reset(args.domain)} demo account(s) and everything they owned.")
        if args.clear:
            return 0

    with engine.connect() as c:
        if c.execute(text("select 1 from users where email = :e"), {"e": f"organizer@{args.domain}"}).first():
            print("Demo data already exists. Run with --reset to recreate it.")
            return 1

    ids = seed(args.domain)
    print(f"""
Demo ready. Every account's password is DEMO_PASSWORD in scripts/seed_demo.py.

  admin@{args.domain}       platform admin
  organizer@{args.domain}   approved organizer, owns all 4 events
  staff@{args.domain}       check-in staff (meetup and festival)
  aigerim@{args.domain}     attendee with paid tickets (also daniyar, aliya, timur, madina, ...)

  #{ids['jazz']:<5} Astana Jazz Night      paid, upcoming; promo codes JAZZ20 and STUDENT
  #{ids['meetup']:<5} Almaty Tech Meetup     free, happening now; 4 of 7 checked in
  #{ids['fest']:<5} Nauryz Fest            completed 3 weeks ago; for analytics
  #{ids['draft']:<5} Summer Open Air        draft
""")
    return 0


if __name__ == "__main__":
    sys.exit(main())
