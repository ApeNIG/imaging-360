# Consolidated outputs for easy reference

output "environment_config" {
  description = "Environment configuration for .env file"
  sensitive   = true
  value = {
    DATABASE_URL   = "postgresql://${var.db_username}:${random_password.db_password.result}@${aws_db_instance.main.endpoint}/${var.db_name}"
    AWS_REGION     = var.aws_region
    S3_BUCKET      = aws_s3_bucket.images.id
    SQS_QUEUE_URL  = aws_sqs_queue.image_processing.url
    DB_SECRET_ARN  = aws_secretsmanager_secret.db_password.arn
    API_ROLE_ARN   = aws_iam_role.api.arn
    WORKER_ROLE_ARN = aws_iam_role.worker.arn
  }
}

output "infrastructure_summary" {
  description = "Summary of created infrastructure"
  value = {
    s3_bucket     = aws_s3_bucket.images.id
    sqs_queue     = aws_sqs_queue.image_processing.id
    sqs_dlq       = aws_sqs_queue.image_processing_dlq.id
    rds_endpoint  = aws_db_instance.main.endpoint
    rds_db_name   = aws_db_instance.main.db_name
  }
}
