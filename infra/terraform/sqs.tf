# Main processing queue
resource "aws_sqs_queue" "image_processing" {
  name                       = "${var.project_name}-${var.environment}-image-processing"
  visibility_timeout_seconds = var.worker_timeout * 2 # 2x worker timeout
  message_retention_seconds  = 86400                  # 1 day
  receive_wait_time_seconds  = 20                     # Long polling

  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.image_processing_dlq.arn
    maxReceiveCount     = 3
  })
}

# Dead letter queue
resource "aws_sqs_queue" "image_processing_dlq" {
  name                      = "${var.project_name}-${var.environment}-image-processing-dlq"
  message_retention_seconds = 1209600 # 14 days
}

# Queue policy to allow S3 to send notifications
resource "aws_sqs_queue_policy" "image_processing" {
  queue_url = aws_sqs_queue.image_processing.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect    = "Allow"
        Principal = { Service = "s3.amazonaws.com" }
        Action    = "sqs:SendMessage"
        Resource  = aws_sqs_queue.image_processing.arn
        Condition = {
          ArnLike = {
            "aws:SourceArn" = aws_s3_bucket.images.arn
          }
        }
      }
    ]
  })
}

# Outputs
output "sqs_queue_url" {
  value = aws_sqs_queue.image_processing.url
}

output "sqs_queue_arn" {
  value = aws_sqs_queue.image_processing.arn
}

output "sqs_dlq_url" {
  value = aws_sqs_queue.image_processing_dlq.url
}
