import { Button } from "@/components/ui/button";
import prisma from "@/lib/db";


const page = async () => {
  // async work with promises اي الانتظار
  const users = await prisma.user.findMany();

  return (
    <div className=" min-h-screen min-w-screen flex items-center justify-center">
      {JSON.stringify(users)}
    </div>
  )
}

export default page;