import { CircleCheckIcon, CircleXIcon, LoaderCircleIcon } from "lucide-react";
import type { NodeExecutionStatus } from "@/features/editor/stores/atoms";
import styles from "@/features/triggers/components/execution-state.module.css";
import { cn } from "@/lib/utils";

const statusClassNames: Record<NodeExecutionStatus, string> = {
  IDLE: styles.idle,
  PENDING: styles.pending,
  RUNNING: styles.running,
  SUCCESS: styles.success,
  FAILED: styles.error,
};

export const executionNodeClassName = (status: NodeExecutionStatus) =>
  cn(styles.node, statusClassNames[status]);

export const NodeExecutionIndicator = ({
  status,
  error,
}: {
  status: NodeExecutionStatus;
  error?: string | null;
}) => {
  if (status === "IDLE" || status === "PENDING") {
    return null;
  }

  const indicatorClass =
    status === "RUNNING"
      ? styles.runningIndicator
      : status === "SUCCESS"
        ? styles.successIndicator
        : styles.errorIndicator;

  return (
    <output
      aria-label={`Node execution ${status.toLowerCase()}`}
      title={
        status === "FAILED" ? (error ?? "Node execution failed") : undefined
      }
      className={cn(styles.statusIndicator, indicatorClass)}
    >
      {status === "RUNNING" && (
        <LoaderCircleIcon className={cn("size-4", styles.spinner)} />
      )}
      {status === "SUCCESS" && <CircleCheckIcon className="size-4" />}
      {status === "FAILED" && <CircleXIcon className="size-4" />}
    </output>
  );
};
