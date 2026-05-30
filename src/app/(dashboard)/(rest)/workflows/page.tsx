import { prefetchWorkflows } from "@/features/workflow/server/prefetch";
import { requireAuth } from "@/lib/auth-utils";
import { HydrateClient } from "@/trpc/server";
import { Suspense } from "react";
import { ErrorBoundary } from "react-error-boundary";
import { WorkflowsContainer, WorkflowsList } from "@/features/workflow/components/workflows";

const page = async () => {
    await requireAuth();

    prefetchWorkflows();
    return (
        <WorkflowsContainer>
        <HydrateClient>
            <ErrorBoundary fallback={<p>Error!</p>}>
                <Suspense fallback={<p>Loading...</p>}>
                    <WorkflowsList />
                </Suspense>
            </ErrorBoundary>
        </HydrateClient>
        </WorkflowsContainer>
    )
};

export default page;