from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from django.utils import timezone


def request_timezone(request):
    """The viewer's timezone from ?tz=Area/City, falling back to settings.TIME_ZONE.

    Day/month boundaries ("today", "this month") must follow the user's local
    calendar, not the server's (UTC).
    """
    name = request.query_params.get("tz", "") if request is not None else ""
    if name:
        try:
            return ZoneInfo(name)
        except (ZoneInfoNotFoundError, ValueError):
            pass
    return timezone.get_current_timezone()
