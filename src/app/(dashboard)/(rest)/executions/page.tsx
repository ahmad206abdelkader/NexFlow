import { requireAuth } from "@/lib/auth-utils";

const page = async () => {
    await requireAuth();
    return (
        <p>Executions</p>
    )
};

export default page;