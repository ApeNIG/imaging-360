# Main storage bucket
resource "aws_s3_bucket" "images" {
  bucket = "${var.project_name}-${var.environment}"
}

resource "aws_s3_bucket_versioning" "images" {
  bucket = aws_s3_bucket.images.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "images" {
  bucket = aws_s3_bucket.images.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "images" {
  bucket = aws_s3_bucket.images.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_cors_configuration" "images" {
  bucket = aws_s3_bucket.images.id

  cors_rule {
    allowed_headers = ["*"]
    allowed_methods = ["PUT", "GET", "HEAD"]
    allowed_origins = ["*"] # Restrict in production
    expose_headers  = ["ETag"]
    max_age_seconds = 3600
  }
}

# Lifecycle rules
resource "aws_s3_bucket_lifecycle_configuration" "images" {
  bucket = aws_s3_bucket.images.id

  rule {
    id     = "transition-to-ia"
    status = "Enabled"

    filter {
      prefix = "org/"
    }

    transition {
      days          = 90
      storage_class = "STANDARD_IA"
    }

    transition {
      days          = 365
      storage_class = "GLACIER"
    }
  }
}

# S3 Event Notification to SQS
resource "aws_s3_bucket_notification" "images" {
  bucket = aws_s3_bucket.images.id

  queue {
    queue_arn     = aws_sqs_queue.image_processing.arn
    events        = ["s3:ObjectCreated:*"]
    filter_prefix = "org/"
    filter_suffix = ".jpg"
  }

  queue {
    queue_arn     = aws_sqs_queue.image_processing.arn
    events        = ["s3:ObjectCreated:*"]
    filter_prefix = "org/"
    filter_suffix = ".heic"
  }

  depends_on = [aws_sqs_queue_policy.image_processing]
}

# Outputs
output "s3_bucket_name" {
  value = aws_s3_bucket.images.id
}

output "s3_bucket_arn" {
  value = aws_s3_bucket.images.arn
}
