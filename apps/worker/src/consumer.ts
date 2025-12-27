import {
  SQSClient,
  ReceiveMessageCommand,
  DeleteMessageCommand,
  ChangeMessageVisibilityCommand,
} from '@aws-sdk/client-sqs';
import { logger } from './lib/logger.js';
import { processImage } from './pipeline/index.js';
import { closeDb } from './lib/db.js';
import type { S3EventRecord } from '@360-imaging/shared';

const sqsClient = new SQSClient({
  region: process.env.AWS_REGION || 'us-east-1',
});

const QUEUE_URL = process.env.SQS_QUEUE_URL!;
const POLL_INTERVAL_MS = 20000; // Long polling timeout
const MAX_CONCURRENT = parseInt(process.env.MAX_CONCURRENT || '5', 10);
const VISIBILITY_TIMEOUT_SECONDS = 120;

let isRunning = false;
let activeJobs = 0;

interface S3EventMessage {
  Records: Array<{
    eventName: string;
    s3: {
      bucket: { name: string };
      object: { key: string; size: number; eTag: string };
    };
  }>;
}

export async function startConsumer(): Promise<void> {
  if (!QUEUE_URL) {
    throw new Error('SQS_QUEUE_URL not configured');
  }

  isRunning = true;
  logger.info({ queueUrl: QUEUE_URL, maxConcurrent: MAX_CONCURRENT }, 'Starting SQS consumer');

  poll();
}

export async function stopConsumer(): Promise<void> {
  logger.info('Stopping SQS consumer...');
  isRunning = false;

  // Wait for active jobs to complete
  const maxWait = 30000;
  const start = Date.now();

  while (activeJobs > 0 && Date.now() - start < maxWait) {
    logger.info({ activeJobs }, 'Waiting for active jobs to complete');
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  if (activeJobs > 0) {
    logger.warn({ activeJobs }, 'Forcing shutdown with active jobs');
  }

  await closeDb();
  logger.info('SQS consumer stopped');
}

async function poll(): Promise<void> {
  while (isRunning) {
    try {
      // Only poll if we have capacity
      if (activeJobs >= MAX_CONCURRENT) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        continue;
      }

      const messages = await receiveMessages();

      for (const message of messages) {
        if (!isRunning) break;
        if (!message.Body || !message.ReceiptHandle) continue;

        // Process in background
        activeJobs++;
        processMessage(message.Body, message.ReceiptHandle)
          .catch((error) => {
            logger.error({ error }, 'Message processing failed');
          })
          .finally(() => {
            activeJobs--;
          });
      }
    } catch (error) {
      logger.error({ error }, 'Error polling SQS');
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  }
}

async function receiveMessages() {
  const command = new ReceiveMessageCommand({
    QueueUrl: QUEUE_URL,
    MaxNumberOfMessages: Math.min(10, MAX_CONCURRENT - activeJobs),
    WaitTimeSeconds: 20,
    VisibilityTimeout: VISIBILITY_TIMEOUT_SECONDS,
  });

  const response = await sqsClient.send(command);
  return response.Messages || [];
}

async function processMessage(body: string, receiptHandle: string): Promise<void> {
  const startTime = Date.now();

  try {
    // Parse S3 event
    const event: S3EventMessage = JSON.parse(body);

    for (const record of event.Records) {
      // Only process object created events
      if (!record.eventName.startsWith('ObjectCreated:')) {
        continue;
      }

      const s3Record: S3EventRecord = {
        bucket: record.s3.bucket.name,
        key: decodeURIComponent(record.s3.object.key.replace(/\+/g, ' ')),
        size: record.s3.object.size,
        etag: record.s3.object.eTag,
      };

      logger.info({ key: s3Record.key }, 'Processing image');

      // Extend visibility timeout for long processing
      const extendVisibility = setInterval(async () => {
        try {
          await sqsClient.send(new ChangeMessageVisibilityCommand({
            QueueUrl: QUEUE_URL,
            ReceiptHandle: receiptHandle,
            VisibilityTimeout: VISIBILITY_TIMEOUT_SECONDS,
          }));
        } catch (error) {
          logger.warn({ error }, 'Failed to extend message visibility');
        }
      }, (VISIBILITY_TIMEOUT_SECONDS / 2) * 1000);

      try {
        await processImage(s3Record);

        clearInterval(extendVisibility);

        // Delete message on success
        await deleteMessage(receiptHandle);

        const duration = Date.now() - startTime;
        logger.info({ key: s3Record.key, duration }, 'Image processing complete');
      } catch (error) {
        clearInterval(extendVisibility);
        throw error;
      }
    }
  } catch (error) {
    const duration = Date.now() - startTime;
    logger.error({ error, duration }, 'Failed to process message');

    // Don't delete - let it go to DLQ after retries
    throw error;
  }
}

async function deleteMessage(receiptHandle: string): Promise<void> {
  const command = new DeleteMessageCommand({
    QueueUrl: QUEUE_URL,
    ReceiptHandle: receiptHandle,
  });

  await sqsClient.send(command);
}
