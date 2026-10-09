"""Attachment storage on S3 (presigned uploads/downloads)."""

from urllib.parse import quote

from django.conf import settings

from apps.core.s3 import s3_client as _client


class StorageNotConfigured(Exception):
    pass


def _bucket() -> str:
    if not settings.AWS_STORAGE_BUCKET_NAME:
        raise StorageNotConfigured
    return settings.AWS_STORAGE_BUCKET_NAME


def presigned_upload(key: str, content_type: str, max_bytes: int, expires: int = 600) -> dict:
    """A POST policy pinned to this key and type; S3 itself rejects bodies over max_bytes."""
    return _client().generate_presigned_post(
        Bucket=_bucket(),
        Key=key,
        Fields={"Content-Type": content_type},
        Conditions=[{"Content-Type": content_type}, ["content-length-range", 1, max_bytes]],
        ExpiresIn=expires,
    )


def object_info(key: str) -> dict | None:
    from botocore.exceptions import ClientError

    try:
        return _client().head_object(Bucket=_bucket(), Key=key)
    except ClientError as e:
        if e.response.get("Error", {}).get("Code") in ("404", "NoSuchKey", "NotFound"):
            return None
        raise


def presigned_download(key: str, filename: str, inline: bool = False, expires: int = 300) -> str:
    ascii_name = filename.encode("ascii", "replace").decode().replace('"', "")
    disposition = (
        f'{"inline" if inline else "attachment"}; filename="{ascii_name}"; '
        f"filename*=UTF-8''{quote(filename)}"
    )
    return _client().generate_presigned_url(
        "get_object",
        Params={"Bucket": _bucket(), "Key": key, "ResponseContentDisposition": disposition},
        ExpiresIn=expires,
    )


def delete_object(key: str) -> None:
    _client().delete_object(Bucket=_bucket(), Key=key)
