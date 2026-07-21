import Link from "next/link";
import { ThemeLogo } from "@/components/theme-logo";

export const AuthLayout = ({ children }: { children: React.ReactNode }) => {
  return (
    <div className="bg-muted flex min-h-svh items-center flex-col justify-center gap-6 p-6 md:p-10">
      <div className="flex w-fall max-w-sm flex-col gap-6">
        <Link
          href="/"
          className="flex items-center gap-2 self-center font-medium "
        >
          <ThemeLogo alt="NexFlow" width={30} height={30} />
          NexFlow
        </Link>
        {children}
      </div>
    </div>
  );
};
