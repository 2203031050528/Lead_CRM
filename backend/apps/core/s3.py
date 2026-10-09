"""Shared S3 client. boto3 is imported on first use: it adds tens of MB to every process that
loads it, and most requests (and cron jobs) never touch S3."""

from functools import cache

from django.conf import settings


@cache
def s3_client():
    import boto3
    from botocore.config import Config

    endpoint = settings.AWS_S3_ENDPOINT_URL or None
    return boto3.client(
        "s3",
        region_name=settings.AWS_REGION,
        endpoint_url=endpoint,
        aws_access_key_id=settings.AWS_ACCESS_KEY_ID,  # None → instance role / default chain
        aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY,
        config=Config(
            signature_version="s3v4",
            s3={"addressing_style": "path" if endpoint else "virtual"},
            retries={"max_attempts": 3, "mode": "standard"},
        ),
    )
