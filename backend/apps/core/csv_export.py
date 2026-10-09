import csv
from collections.abc import Iterable, Sequence

from django.http import StreamingHttpResponse
from django.utils import timezone

# Cells starting with these are treated as formulas by Excel/Sheets (CSV injection).
FORMULA_PREFIXES = ("=", "+", "-", "@", "\t", "\r")


def safe_cell(value) -> str:
    if value is None:
        return ""
    if hasattr(value, "isoformat"):
        return value.isoformat()
    text = str(value)
    return f"'{text}" if text.startswith(FORMULA_PREFIXES) else text


class _Echo:
    """csv.writer target that hands each formatted line straight back."""

    def write(self, value):
        return value


def csv_download(
    name: str, header: Sequence[str], rows: Iterable[Sequence]
) -> StreamingHttpResponse:
    """Stream rows as a UTF-8 CSV download without building the file in memory."""
    writer = csv.writer(_Echo())

    def lines():
        yield "﻿"  # BOM: Excel otherwise misreads UTF-8
        yield writer.writerow(header)
        for row in rows:
            yield writer.writerow([safe_cell(v) for v in row])

    response = StreamingHttpResponse(lines(), content_type="text/csv; charset=utf-8")
    stamp = timezone.localdate().isoformat()
    response["Content-Disposition"] = f'attachment; filename="{name}-{stamp}.csv"'
    return response
