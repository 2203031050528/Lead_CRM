from rest_framework.views import exception_handler as drf_exception_handler


def _first(value) -> str:
    while isinstance(value, list | tuple) and value:
        value = value[0]
    return str(value) if value not in (None, [], ()) else ""


def exception_handler(exc, context):
    """Normalise every error to {"detail": str, "errors": {field: [msgs]}}."""
    response = drf_exception_handler(exc, context)
    if response is None:
        return None
    data = response.data
    if isinstance(data, dict):
        errors = {k: v for k, v in data.items() if k not in ("detail", "non_field_errors")}
        detail = _first(data.get("detail")) or _first(data.get("non_field_errors"))
        if not detail:
            detail = "Validation failed." if errors else "Error."
        response.data = {"detail": detail, "errors": errors}
    else:
        response.data = {"detail": _first(data) or "Error.", "errors": {}}
    return response
