"use client"

import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";
import { useRouter } from "next/navigation";

const page = () => {
  const {data} = authClient.useSession();
  const router = useRouter();

  return (
    <div className=" min-h-screen min-w-screen flex items-center justify-center">
     {JSON.stringify(data)}
     {data && (
     <Button onClick={() => authClient.signOut({
  fetchOptions: {
    onSuccess: () => {
      router.refresh();
    }
  }
})}>
  Log Out
</Button>
     )}
    </div>
  );
};

export default page;
