import { prefetchWorkflows } from "@/features/workflow/server/prefetch";
import { requireAuth } from "@/lib/auth-utils";
import { HydrateClient } from "@/trpc/server";
import { Suspense } from "react";
import { ErrorBoundary } from "react-error-boundary";
import { WorkflowsContainer, WorkflowsList, WorkflowsLoading, WorkflowsError } from "@/features/workflow/components/workflows";
import type { SearchParams } from "nuqs/server";
import { workflowsParamsLoader } from "@/features/workflow/server/params-loader";

type Props = {
    serachParams: Promise<SearchParams>
}

const page = async ({ serachParams }: Props) => {
    await requireAuth();

    const params = await workflowsParamsLoader(serachParams);
    prefetchWorkflows(params);
    
    return (
        <WorkflowsContainer>
        <HydrateClient>
            <ErrorBoundary fallback={<WorkflowsError />}>
                <Suspense fallback={<WorkflowsLoading />}>
                    <WorkflowsList />
                </Suspense>
            </ErrorBoundary>
        </HydrateClient>
        </WorkflowsContainer>
    )
};

export default page;