# CloudFront CDN Configuration for Fablecraft Assets

This directory contains the AWS CloudFormation template for deploying a CloudFront distribution that serves generated images, audio files, and user drawings from the S3 asset bucket.

**Validates: Requirement 13.6** — Assets served via CloudFront CDN with Cache-Control max-age ≥ 3600 seconds; pre-signed URLs have expiration ≤ 3600 seconds.

## Architecture

```
Child's Browser  →  CloudFront Edge  →  S3 Bucket (fablecraft-assets)
                    (cached ≥ 1hr)       (origin, Cache-Control: public, max-age=3600)
```

- **Origin**: S3 bucket (`fablecraft-assets`) secured with Origin Access Control (OAC)
- **Cache Policy**: Minimum TTL of 3600 seconds, default TTL of 86400 seconds
- **Security**: HTTPS-only, OAC restricts direct S3 access, security headers applied
- **Compression**: Gzip and Brotli enabled for supported content types

## Cache-Control Configuration

| Setting | Value | Requirement |
|---------|-------|-------------|
| S3 object `Cache-Control` header | `public, max-age=3600` | 13.6 (≥ 3600s) |
| CloudFront MinTTL | 3600 seconds | 13.6 (≥ 3600s) |
| CloudFront DefaultTTL | 86400 seconds (24 hours) | Performance optimization |
| CloudFront MaxTTL | 31536000 seconds (1 year) | Long-lived assets |

The storage service (`agents_service/storage_service.py`) sets `Cache-Control: public, max-age=3600` on every uploaded object, which CloudFront respects. The cache policy's MinTTL of 3600 ensures no asset is cached for less than 1 hour even if the origin header is missing.

## Pre-Signed URL Expiration

When CloudFront is not configured (CLOUDFRONT_DOMAIN is empty), the storage service falls back to S3 pre-signed URLs. The expiration is enforced in code:

- **Configuration**: `PRESIGNED_URL_EXPIRY_SECONDS=3600` in `.env`
- **Code enforcement**: `expiry = min(settings.presigned_url_expiry_seconds, 3600)` in `storage_service.py`
- **Maximum expiration**: 3600 seconds (1 hour) — URLs cannot be valid longer than this

This ensures compliance with Requirement 13.6 regardless of whether CloudFront or pre-signed URLs are used.

## Deployment

### Prerequisites

- AWS CLI configured with appropriate credentials
- S3 bucket `fablecraft-assets` already created
- IAM permissions for CloudFormation, CloudFront, and S3

### Deploy the Stack

```bash
aws cloudformation deploy \
  --template-file infrastructure/cloudfront/template.yaml \
  --stack-name fablecraft-cloudfront \
  --parameter-overrides file://infrastructure/cloudfront/parameters.json \
  --capabilities CAPABILITY_IAM
```

### Get the CloudFront Domain

After deployment, retrieve the CloudFront domain name:

```bash
aws cloudformation describe-stacks \
  --stack-name fablecraft-cloudfront \
  --query "Stacks[0].Outputs[?OutputKey=='DistributionDomainName'].OutputValue" \
  --output text
```

### Configure the Application

Set the `CLOUDFRONT_DOMAIN` environment variable in `agents_service/.env`:

```env
CLOUDFRONT_DOMAIN=d1234abcdef.cloudfront.net
```

Once set, the storage service automatically generates CloudFront URLs instead of pre-signed S3 URLs:
- Without CloudFront: `https://fablecraft-assets.s3.amazonaws.com/...?X-Amz-Signature=...` (expires in ≤ 3600s)
- With CloudFront: `https://d1234abcdef.cloudfront.net/session-id/uuid.png` (cached ≥ 3600s at edge)

### Update the Stack

```bash
aws cloudformation deploy \
  --template-file infrastructure/cloudfront/template.yaml \
  --stack-name fablecraft-cloudfront \
  --parameter-overrides Environment=staging CacheTTL=3600
```

### Delete the Stack

```bash
aws cloudformation delete-stack --stack-name fablecraft-cloudfront
```

## Validation Checklist

- [x] CloudFront distribution configured with S3 origin via OAC
- [x] Cache-Control headers: MinTTL = 3600s (satisfies max-age ≥ 3600s requirement)
- [x] Pre-signed URL expiration: capped at 3600s in code (satisfies ≤ 3600s requirement)
- [x] HTTPS-only viewer policy (redirect-to-https)
- [x] HTTP/2 and HTTP/3 enabled for performance
- [x] Gzip + Brotli compression enabled
- [x] Security headers (X-Content-Type-Options, X-Frame-Options)
- [x] S3 bucket policy restricts access to CloudFront distribution only
