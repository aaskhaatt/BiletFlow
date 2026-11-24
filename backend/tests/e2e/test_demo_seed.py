"""The demo data script: seeds a full demo through the real services, refuses to run twice, and cleans up.

Uses its own email domain, so it never touches the demo you seeded for yourself.
"""
import os
import subprocess
import sys
from pathlib import Path
from urllib.parse import quote
from helpers import E2E, BACKEND

SCRIPT = BACKEND / "scripts" / "seed_demo.py"
DOMAIN = "e2e-seed.example.com"
sys.path.insert(0, str(SCRIPT.parent))
from seed_demo import DEMO_PASSWORD  # noqa: E402


def run(*args, env=None):
    result = subprocess.run([sys.executable, str(SCRIPT), "--domain", DOMAIN, *args], cwd=BACKEND,
                            capture_output=True, text=True, env={**os.environ, **(env or {})}, timeout=300)
    return result.returncode, result.stdout + result.stderr


def main() -> bool:
    with E2E("demo seed") as t:
        run("--clear")  # in case an earlier run crashed halfway
        t.on_cleanup(lambda: run("--clear"))

        code, out = run()
        t.check("seeds without errors", code == 0 and "Demo ready" in out, f"exit {code}" + (f"\n{out[-1500:]}" if code else ""))
        code, out = run()
        t.check("a second run refuses to duplicate the demo", code == 1 and "already exists" in out, f"exit {code}")
        code, out = run(env={"DATABASE_URL": "postgresql://user:pass@db.example.com:5432/prod"})
        t.check("refuses a database that isn't local", code == 1 and "Refusing" in out, f"exit {code}")

        def login(name):
            s, b = t.call("POST", "/auth/login", {"email": f"{name}@{DOMAIN}", "password": DEMO_PASSWORD})
            return b["access_token"] if s == 200 else None

        org = login("organizer")
        t.check("demo organizer can log in", org is not None)
        s, mine = t.call("GET", "/events/me", token=org)
        by_title = {e["title"]: e for e in mine}
        t.check("4 events: 3 published, 1 draft", len(mine) == 4 and sorted(e["status"] for e in mine)
                == ["draft", "published", "published", "published"], f"{[(e['title'], e['status']) for e in mine]}")
        jazz, meetup, fest = by_title["Astana Jazz Night"], by_title["Almaty Tech Meetup: AI in Production"], by_title["Nauryz Fest"]

        s, page = t.call("GET", f"/events?q={quote('Astana Jazz')}&limit=100")
        t.check("the concert is in the public catalogue", any(e["id"] == jazz["id"] for e in page["items"]))

        # the concert's money, worked out by hand from the orders in the script:
        # 16000-20% + 50000 + 8000-3000 + 24000 + 33000-20% + 16000 + 8000 (after a declined try) + 25000 (refunded)
        s, sales = t.call("GET", f"/events/{jazz['id']}/sales", token=org)
        t.check("concert: 7 paid orders, 12800 in discounts, 25000 refunded, 167200 gross",
                (sales["paid_orders"], sales["discounts"], sales["refunds"], sales["gross_sales"]) == (7, 12800, 25000, 167200),
                f"{sales['paid_orders']} {sales['discounts']} {sales['refunds']} {sales['gross_sales']}")
        s, campaigns = t.call("GET", f"/events/{jazz['id']}/campaigns", token=org)
        t.check("concert: 2 promo codes, JAZZ20 used twice", {c["code"]: c["stats"]["orders"] for c in campaigns}
                == {"JAZZ20": 2, "STUDENT": 1}, f"{[(c['code'], c['stats']['orders']) for c in campaigns]}")

        staff = login("staff")
        s, stats = t.call("GET", f"/events/{meetup['id']}/check-in/stats", token=staff)
        t.check("meetup: staff can scan, 4 of 7 checked in", s == 200 and (stats["registered"], stats["checked_in"]) == (7, 4),
                f"{s} {stats}")
        s, stats = t.call("GET", f"/events/{fest['id']}/check-in/stats", token=staff)
        t.check("festival: in the past, with check-ins", fest["end_time"] < jazz["start_time"] and stats["checked_in"] > 0,
                f"{stats}")

        attendee = login("aigerim")
        s, orders = t.call("GET", "/orders/me", token=attendee)
        t.check("attendees have tickets", s == 200 and any(o["tickets"] for o in orders), f"{len(orders)} orders")
        admin = login("admin")
        s, _ = t.call("GET", "/admin/settings", token=admin)
        t.check("the admin is a platform admin", s == 200, f"status {s}")

        code, out = run("--clear")
        t.check("--clear removes all 13 demo accounts", code == 0 and "Removed 13" in out, out.strip())
        t.check("and they can't log in any more", login("organizer") is None)
    return t.passed


if __name__ == "__main__":
    sys.exit(0 if main() else 1)
