#!/bin/bash

echo "Initializing LocalStack resources..."

# Create S3 bucket
awslocal s3 mb s3://imaging360-dev

# Enable S3 bucket notifications to SQS
# First create the SQS queue
awslocal sqs create-queue --queue-name imaging360-uploads

# Get the queue ARN
QUEUE_ARN=$(awslocal sqs get-queue-attributes \
  --queue-url http://sqs.us-east-1.localhost.localstack.cloud:4566/000000000000/imaging360-uploads \
  --attribute-names QueueArn \
  --query 'Attributes.QueueArn' \
  --output text)

echo "Queue ARN: $QUEUE_ARN"

# Set queue policy to allow S3 to send messages
awslocal sqs set-queue-attributes \
  --queue-url http://sqs.us-east-1.localhost.localstack.cloud:4566/000000000000/imaging360-uploads \
  --attributes '{
    "Policy": "{\"Version\":\"2012-10-17\",\"Statement\":[{\"Effect\":\"Allow\",\"Principal\":\"*\",\"Action\":\"sqs:SendMessage\",\"Resource\":\"*\"}]}"
  }'

# Configure S3 bucket notification to SQS for image uploads
awslocal s3api put-bucket-notification-configuration \
  --bucket imaging360-dev \
  --notification-configuration '{
    "QueueConfigurations": [
      {
        "QueueArn": "'"$QUEUE_ARN"'",
        "Events": ["s3:ObjectCreated:*"],
        "Filter": {
          "Key": {
            "FilterRules": [
              {"Name": "prefix", "Value": "org/"}
            ]
          }
        }
      }
    ]
  }'

# Create DLQ for failed processing
awslocal sqs create-queue --queue-name imaging360-uploads-dlq

# Configure main queue with DLQ
DLQ_ARN=$(awslocal sqs get-queue-attributes \
  --queue-url http://sqs.us-east-1.localhost.localstack.cloud:4566/000000000000/imaging360-uploads-dlq \
  --attribute-names QueueArn \
  --query 'Attributes.QueueArn' \
  --output text)

awslocal sqs set-queue-attributes \
  --queue-url http://sqs.us-east-1.localhost.localstack.cloud:4566/000000000000/imaging360-uploads \
  --attributes '{
    "RedrivePolicy": "{\"deadLetterTargetArn\":\"'"$DLQ_ARN"'\",\"maxReceiveCount\":3}"
  }'

echo "LocalStack initialization complete!"
echo "S3 Bucket: imaging360-dev"
echo "SQS Queue: imaging360-uploads"
echo "SQS DLQ: imaging360-uploads-dlq"
