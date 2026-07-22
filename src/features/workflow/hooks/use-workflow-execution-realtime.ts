"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useRealtime } from "inngest/react";
import { useSetAtom } from "jotai";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { workflowExecutionAtom } from "@/features/editor/stores/atoms";
import {
  applyExecutionStatusEvent,
  applyNodeStatusEvent,
} from "@/features/workflow/lib/reconcile-execution-state";
import {
  workflowExecutionChannel,
  workflowExecutionTopics,
} from "@/inngest/realtime";
import { useTRPC } from "@/trpc/client";

export const useWorkflowExecutionRealtime = ({
  executionId,
  workflowId,
}: {
  executionId: string | null;
  workflowId: string;
}) => {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const setExecution = useSetAtom(workflowExecutionAtom);
  const previousConnectionStatus = useRef<string | null>(null);
  const channel = useMemo(
    () => (executionId ? workflowExecutionChannel({ executionId }) : undefined),
    [executionId],
  );
  const getToken = useCallback(async () => {
    if (!executionId) {
      throw new Error("An execution is required for a realtime subscription.");
    }

    return queryClient.fetchQuery({
      ...trpc.workflows.getRealtimeToken.queryOptions({ executionId }),
      staleTime: 0,
    });
  }, [executionId, queryClient, trpc]);

  const realtime = useRealtime({
    channel,
    topics: [...workflowExecutionTopics],
    token: executionId ? getToken : undefined,
    key: executionId ?? undefined,
    enabled: Boolean(executionId),
    autoCloseOnTerminal: false,
  });

  useEffect(() => {
    for (const message of realtime.messages.delta) {
      if (message.kind === "run") {
        continue;
      }

      if (message.topic === "node.status") {
        setExecution((current) => applyNodeStatusEvent(current, message.data));
      } else if (
        message.topic === "execution.status" ||
        message.topic === "execution.completed"
      ) {
        setExecution((current) =>
          applyExecutionStatusEvent(current, message.data),
        );
      }
    }
  }, [realtime.messages.delta, setExecution]);

  useEffect(() => {
    const wasOpen = previousConnectionStatus.current === "open";
    const isOpen = realtime.connectionStatus === "open";

    if (isOpen && !wasOpen) {
      queryClient.invalidateQueries(
        trpc.workflows.getLatestExecution.queryOptions({ workflowId }),
      );
    }

    previousConnectionStatus.current = realtime.connectionStatus;
  }, [queryClient, realtime.connectionStatus, trpc, workflowId]);

  return {
    connectionStatus: realtime.connectionStatus,
    isHealthy: realtime.connectionStatus === "open",
    error: realtime.error,
  };
};
