import { TRPCError } from "@trpc/server";
import prisma from "@/lib/db";

type ExecutionIdentity = { id: string; userId: string };
type FindExecution = (input: {
  executionId: string;
  userId: string;
}) => Promise<ExecutionIdentity | null>;

const findExecution: FindExecution = ({ executionId, userId }) =>
  prisma.workflowExecution.findFirst({
    where: { id: executionId, userId },
    select: { id: true, userId: true },
  });

export const authorizeRealtimeExecution = async (
  input: { executionId: string; userId: string },
  lookup: FindExecution = findExecution,
) => {
  const execution = await lookup(input);

  if (!execution) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Workflow execution was not found.",
    });
  }

  return execution;
};
