import { requireAuth } from "@/lib/auth-utils";

const page = async () => {
    await requireAuth();
    return (
        <p>Workflows</p>
    )
};

export default page;