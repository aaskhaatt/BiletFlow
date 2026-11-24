"""Public event catalogue: search, filters, paging and the category list on GET /events."""
import secrets
import sys
from datetime import timedelta, timezone
from urllib.parse import urlencode
from helpers import E2E, NOW, iso


def at(days: float) -> dict:
    # an event starting `days` from now, lasting 3 hours
    start = NOW + timedelta(days=days)
    return {"start_time": iso(start), "end_time": iso(start + timedelta(hours=3))}


def main() -> bool:
    with E2E("event search") as t:
        org, _ = t.new_user(organizer=True)
        # a random word only this run's events contain, so other events in the database never get in the way
        tag = "srch" + secrets.token_hex(4)

        def search(**params):
            return t.call("GET", "/events?" + urlencode(params))

        def ids(page):
            return [e["id"] for e in page["items"]]

        # the tag appears in a different field of each event
        jazz = t.make_event(org, title=f"{tag} Jazz night", category=f"Music-{tag}", **at(2))
        football = t.make_event(org, title="Football", category=f"Sport-{tag}",
                                venue_address=f"Almaty, {tag} street 1", **at(5))
        rock = t.make_event(org, title="Rock", description=f"The {tag} tour", category=f"music-{tag}", **at(9))
        # must never appear in the public catalogue
        draft = t.make_event(org, publish=False, title=f"{tag} Draft", category=f"Draft-{tag}", **at(3))
        unlisted = t.make_event(org, title=f"{tag} Unlisted", visibility="unlisted", **at(3))
        private = t.make_event(org, title=f"{tag} Private", visibility="private", **at(3))
        past = t.make_event(org, title=f"{tag} Last year", category=f"Old-{tag}", **at(-3))

        # text search
        s, page = search(q=tag)
        t.check("shape is {items, total}", s == 200 and set(page) == {"items", "total"}, f"status {s}")
        t.check("q matches title, venue address and description", ids(page) == [jazz, football, rock], f"{ids(page)}")
        t.check("total counts the matches", page["total"] == 3, f"total {page['total']}")
        t.check("drafts, unlisted, private and past are left out",
                not {draft, unlisted, private, past} & set(ids(page)))
        s, page = search(q=tag.upper())
        t.check("q is case-insensitive", ids(page) == [jazz, football, rock])
        s, page = search(q=f"{tag} jazz")
        t.check("q narrows to one event", ids(page) == [jazz])
        s, page = search(q=f"{tag}%")
        t.check("% in q is a plain character, not a wildcard", s == 200 and page["total"] == 0, f"total {page and page['total']}")
        s, page = search(q=f"  {tag}  ")
        t.check("spaces around q are ignored", page["total"] == 3)

        # filters
        s, page = search(q=tag, category=f"MUSIC-{tag}")
        t.check("category is exact but case-insensitive", ids(page) == [jazz, rock], f"{ids(page)}")
        s, page = search(q=tag, date_from=iso(NOW + timedelta(days=3)))
        t.check("date_from", ids(page) == [football, rock], f"{ids(page)}")
        s, page = search(q=tag, date_to=iso(NOW + timedelta(days=6)))
        t.check("date_to", ids(page) == [jazz, football], f"{ids(page)}")
        s, page = search(q=tag, date_from=iso(NOW + timedelta(days=3)), date_to=iso(NOW + timedelta(days=6)))
        t.check("date_from and date_to together", ids(page) == [football], f"{ids(page)}")
        naive = (NOW + timedelta(days=3)).astimezone(timezone.utc).replace(tzinfo=None).isoformat()
        s, page = search(q=tag, date_from=naive)
        t.check("a date without timezone is read as UTC", s == 200 and ids(page) == [football, rock], f"status {s}")
        s, page = search(q=tag, include_past="true")
        t.check("include_past brings back ended events", ids(page) == [past, jazz, football, rock], f"{ids(page)}")

        # paging
        s, page = search(q=tag, limit=2)
        t.check("limit: first page", ids(page) == [jazz, football] and page["total"] == 3, f"{ids(page)}")
        s, page = search(q=tag, limit=2, offset=2)
        t.check("offset: second page", ids(page) == [rock] and page["total"] == 3, f"{ids(page)}")
        s, page = search(q=tag, offset=10)
        t.check("offset past the end: empty page, same total", page["items"] == [] and page["total"] == 3)

        # bad input
        for name, params in [("limit=0", {"limit": 0}), ("limit=101", {"limit": 101}),
                             ("offset=-1", {"offset": -1}), ("date_from=yesterday", {"date_from": "yesterday"}),
                             ("q longer than 100", {"q": "x" * 101})]:
            s, body = search(**params)
            t.check(f"rejects {name}", s == 422 and body["error"] == "VALIDATION_ERROR", f"status {s}")

        # categories for the filter dropdown
        s, categories = t.call("GET", "/events/categories")
        t.check("categories: 200, a list of strings", s == 200 and all(isinstance(c, str) for c in categories), f"status {s}")
        t.check("categories: upcoming public events are listed",
                {f"Music-{tag}", f"music-{tag}", f"Sport-{tag}"} <= set(categories))
        t.check("categories: drafts and past events are not", not {f"Draft-{tag}", f"Old-{tag}"} & set(categories))
    return t.passed


if __name__ == "__main__":
    sys.exit(0 if main() else 1)
