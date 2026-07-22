ALTER TYPE "NodeType" ADD VALUE 'googleFormsTrigger';

ALTER TABLE "Workflow"
ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE "GoogleFormsWebhook" (
    "id" TEXT NOT NULL,
    "publicId" TEXT NOT NULL,
    "secretHash" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "userId" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "triggerNodeId" TEXT NOT NULL,
    "lastReceivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GoogleFormsWebhook_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GoogleFormsWebhookEvent" (
    "id" TEXT NOT NULL,
    "webhookConfigId" TEXT NOT NULL,
    "idempotencyKeyHash" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "inngestEventId" TEXT NOT NULL,
    "lastAttemptAt" TIMESTAMP(3),
    "queuedAt" TIMESTAMP(3),
    "processingStartedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "errorCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GoogleFormsWebhookEvent_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "WorkflowExecution"
ADD COLUMN "googleFormsEventId" TEXT;

CREATE UNIQUE INDEX "GoogleFormsWebhook_publicId_key"
ON "GoogleFormsWebhook"("publicId");

CREATE UNIQUE INDEX "GoogleFormsWebhook_workflowId_triggerNodeId_key"
ON "GoogleFormsWebhook"("workflowId", "triggerNodeId");

CREATE INDEX "GoogleFormsWebhook_userId_workflowId_idx"
ON "GoogleFormsWebhook"("userId", "workflowId");

CREATE UNIQUE INDEX "GoogleFormsWebhookEvent_inngestEventId_key"
ON "GoogleFormsWebhookEvent"("inngestEventId");

CREATE UNIQUE INDEX "GoogleFormsWebhookEvent_webhookConfigId_idempotencyKeyHash_key"
ON "GoogleFormsWebhookEvent"("webhookConfigId", "idempotencyKeyHash");

CREATE INDEX "GoogleFormsWebhookEvent_webhookConfigId_createdAt_idx"
ON "GoogleFormsWebhookEvent"("webhookConfigId", "createdAt");

CREATE UNIQUE INDEX "WorkflowExecution_googleFormsEventId_key"
ON "WorkflowExecution"("googleFormsEventId");

ALTER TABLE "GoogleFormsWebhook"
ADD CONSTRAINT "GoogleFormsWebhook_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "GoogleFormsWebhook"
ADD CONSTRAINT "GoogleFormsWebhook_workflowId_fkey"
FOREIGN KEY ("workflowId") REFERENCES "Workflow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "GoogleFormsWebhookEvent"
ADD CONSTRAINT "GoogleFormsWebhookEvent_webhookConfigId_fkey"
FOREIGN KEY ("webhookConfigId") REFERENCES "GoogleFormsWebhook"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WorkflowExecution"
ADD CONSTRAINT "WorkflowExecution_googleFormsEventId_fkey"
FOREIGN KEY ("googleFormsEventId") REFERENCES "GoogleFormsWebhookEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
