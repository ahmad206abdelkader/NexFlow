import {
  useMutation,
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { toast } from "sonner";
import { useTRPC } from "@/trpc/client";
import { getExecutionPollingInterval } from "../lib/reconcile-execution-state";
import { useWorkflowsParams } from "./use-workflows-params";

// Hook to fetch all workflows using suspense
export const useSuspenseWorkflows = () => {
  const trpc = useTRPC();
  const [params] = useWorkflowsParams();
  return useSuspenseQuery(trpc.workflows.getMany.queryOptions(params));
};

//Hook to create a new workflow

export const useCreateWorkflow = () => {
  const queryClient = useQueryClient();
  const trpc = useTRPC();

  return useMutation(
    trpc.workflows.create.mutationOptions({
      onSuccess: (data) => {
        toast.success(`Workflow "${data.name}" created`);
        queryClient.invalidateQueries(trpc.workflows.getMany.queryOptions({}));
      },
      onError: (error) => {
        toast.error(`Failed to create workflow: ${error.message}`);
      },
    }),
  );
};

//hook remove workflow

export const useRemoveWorkflow = () => {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  return useMutation(
    trpc.workflows.remove.mutationOptions({
      onSuccess: (data) => {
        toast.success(`Workflow "${data.name}" removed`);
        queryClient.invalidateQueries(trpc.workflows.getMany.queryOptions({}));
        queryClient.invalidateQueries(
          trpc.workflows.getOne.queryFilter({ id: data.id }),
        );
      },
    }),
  );
};

// hook to fetch a single workflow using sospense

export const useSuspenseWorkflow = (id: string) => {
  const trpc = useTRPC();
  return useSuspenseQuery(
    trpc.workflows.getOne.queryOptions({
      id,
    }),
  );
};

//hook to update name workflow

export const useUpdateWorkflowName = () => {
  const queryClient = useQueryClient();
  const trpc = useTRPC();

  return useMutation(
    trpc.workflows.updateName.mutationOptions({
      onSuccess: (data) => {
        toast.success(`Workflow "${data.name}" updated`);
        queryClient.invalidateQueries(trpc.workflows.getMany.queryOptions({}));
        queryClient.invalidateQueries(
          trpc.workflows.getOne.queryOptions({ id: data.id }),
        );
      },
      onError: (error) => {
        toast.error(`Failed to create workflow: ${error.message}`);
      },
    }),
  );
};

//hook to update a workflow

export const useUpdateWorkflow = () => {
  const queryClient = useQueryClient();
  const trpc = useTRPC();

  return useMutation(
    trpc.workflows.update.mutationOptions({
      onSuccess: (data) => {
        toast.success(`Workflow "${data.name}" saved`);

        queryClient.invalidateQueries(trpc.workflows.getMany.queryFilter({}));

        queryClient.invalidateQueries(
          trpc.workflows.getOne.queryFilter({
            id: data.id,
          }),
        );
      },

      onError: (error) => {
        console.error("Workflow save error:", error);

        toast.error(`Failed to save workflow: ${error.message}`);
      },
    }),
  );
};

export const useExecuteWorkflow = () => {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  return useMutation(
    trpc.workflows.execute.mutationOptions({
      onSuccess: (data) => {
        toast.success("Workflow execution queued");
        queryClient.invalidateQueries(
          trpc.workflows.getLatestExecution.queryOptions({
            workflowId: data.workflowId,
          }),
        );
      },
      onError: (error, variables) => {
        toast.error(`Failed to queue workflow: ${error.message}`);
        queryClient.invalidateQueries(
          trpc.workflows.getLatestExecution.queryOptions({
            workflowId: variables.id,
          }),
        );
      },
    }),
  );
};

export const useLatestWorkflowExecution = (
  workflowId: string,
  realtimeIsHealthy = false,
  watchForExternalExecutions = false,
) => {
  const trpc = useTRPC();

  return useQuery({
    ...trpc.workflows.getLatestExecution.queryOptions({ workflowId }),
    refetchInterval: (query) =>
      getExecutionPollingInterval(
        query.state.data?.status,
        realtimeIsHealthy,
        watchForExternalExecutions,
      ),
  });
};
