import { requireAuth } from "@/lib/auth-utils";

const page = async () => {
  await requireAuth();
  return <p>Credentials</p>;
};

export default page;
