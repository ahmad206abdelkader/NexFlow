import Image, { type ImageProps } from "next/image";
import { cn } from "@/lib/utils";

type ThemeLogoProps = Omit<ImageProps, "src">;

export function ThemeLogo({ className, ...props }: ThemeLogoProps) {
  return (
    <span className="relative inline-grid shrink-0 align-middle">
      <Image
        src="/logos/logo.svg"
        data-theme-logo
        className={cn(
          "col-start-1 row-start-1 scale-100 opacity-100 transition-[opacity,transform] duration-[650ms] ease-[cubic-bezier(0.22,1,0.36,1)] dark:scale-[0.98] dark:opacity-0 motion-reduce:transform-none motion-reduce:transition-none",
          className,
        )}
        {...props}
      />
      <Image
        src="/logos/logo-blue.svg"
        {...props}
        alt=""
        aria-hidden="true"
        data-theme-logo
        className={cn(
          "pointer-events-none col-start-1 row-start-1 scale-[0.98] opacity-0 transition-[opacity,transform] duration-[650ms] ease-[cubic-bezier(0.22,1,0.36,1)] dark:scale-100 dark:opacity-100 motion-reduce:transform-none motion-reduce:transition-none",
          className,
        )}
      />
    </span>
  );
}
