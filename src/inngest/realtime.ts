import { realtime } from "inngest/realtime";
import { z } from "zod";

export const executionStatuses = [
  "PENDING",
  "RUNNING",
  "SUCCESS",
  "FAILED",
] as const;

export const nodeExecutionStatuses = executionStatuses;

const safeErrorSchema = z.object({
  code: z.string().optional(),
  message: z.string(),
});

export const executionStatusEventSchema = z.object({
  executionId: z.string(),
  workflowId: z.string(),
  status: z.enum(executionStatuses),
  timestamp: z.string(),
  sequence: z.number().int().nonnegative(),
});

export const nodeStatusEventSchema = z.object({
  executionId: z.string(),
  workflowId: z.string(),
  nodeId: z.string(),
  nodeType: z.string(),
  nodeName: z.string().optional(),
  status: z.enum(nodeExecutionStatuses),
  error: safeErrorSchema.optional(),
  output: z.unknown().optional(),
  timestamp: z.string(),
  sequence: z.number().int().nonnegative(),
});

export const executionErrorEventSchema = z.object({
  executionId: z.string(),
  workflowId: z.string(),
  nodeId: z.string().optional(),
  code: z.string().optional(),
  message: z.string(),
  timestamp: z.string(),
  sequence: z.number().int().nonnegative(),
});

export const workflowExecutionChannel = realtime.channel({
  name: ({ executionId }: { executionId: string }) =>
    `workflow-execution:${executionId}`,
  topics: {
    "execution.status": { schema: executionStatusEventSchema },
    "node.status": { schema: nodeStatusEventSchema },
    "execution.error": { schema: executionErrorEventSchema },
    "execution.completed": { schema: executionStatusEventSchema },
  },
});

export const workflowExecutionTopics = [
  "execution.status",
  "node.status",
  "execution.error",
  "execution.completed",
] as const;

const sensitiveHeaderPattern =
  /^(authorization|proxy-authorization|cookie|set-cookie|x-api-key)$/i;

export const sanitizeRealtimeOutput = (output: unknown) => {
  if (typeof output !== "object" || output === null || Array.isArray(output)) {
    return output;
  }

  const record = output as Record<string, unknown>;
  const headers = record.headers;

  if (
    typeof headers !== "object" ||
    headers === null ||
    Array.isArray(headers)
  ) {
    return output;
  }

  return {
    ...record,
    headers: Object.fromEntries(
      Object.entries(headers).filter(
        ([header]) => !sensitiveHeaderPattern.test(header),
      ),
    ),
  };
};

export type ExecutionStatusEvent = z.infer<typeof executionStatusEventSchema>;
export type NodeStatusEvent = z.infer<typeof nodeStatusEventSchema>;
export type ExecutionErrorEvent = z.infer<typeof executionErrorEventSchema>;
