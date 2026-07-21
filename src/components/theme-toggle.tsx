"use client";

import { MoonIcon, SunIcon } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const animationTimeout = useRef<ReturnType<typeof setTimeout>>(null);

  useEffect(() => {
    return () => {
      if (animationTimeout.current) {
        clearTimeout(animationTimeout.current);
      }

      document.documentElement.classList.remove("theme-transition");
    };
  }, []);

  const toggleTheme = () => {
    const root = document.documentElement;
    const isDark = resolvedTheme === "dark" || root.classList.contains("dark");
    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    if (animationTimeout.current) {
      clearTimeout(animationTimeout.current);
    }

    root.classList.remove("theme-transition");

    if (!prefersReducedMotion) {
      root.classList.add("theme-transition");
      // Ensure the transition rules are active before next-themes changes the class.
      root.getBoundingClientRect();

      animationTimeout.current = setTimeout(() => {
        root.classList.remove("theme-transition");
      }, 700);
    }

    setTheme(isDark ? "light" : "dark");
  };

  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      onClick={toggleTheme}
      aria-label="Toggle light and dark mode"
      title="Toggle light and dark mode"
      data-theme-toggle
      className="fixed right-4 bottom-4 z-50 h-8 w-14 overflow-hidden rounded-full bg-background p-0 shadow-lg transition-[background-color,border-color,color,box-shadow] duration-[650ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none"
    >
      <span
        data-theme-thumb
        className="absolute left-1 flex size-6 items-center justify-center rounded-full border border-primary/30 bg-background text-primary shadow-sm transition-[transform,background-color,border-color,color,box-shadow] duration-[650ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none"
        aria-hidden="true"
      >
        <SunIcon
          data-theme-icon="sun"
          className="absolute size-3.5 rotate-0 scale-100 opacity-100 transition-[transform,opacity,filter] duration-[450ms] delay-[140ms] ease-[cubic-bezier(0.22,1,0.36,1)] dark:-rotate-12 dark:scale-90 dark:opacity-0 dark:delay-0 motion-reduce:transition-none"
        />
        <MoonIcon
          data-theme-icon="moon"
          className="absolute size-3.5 rotate-12 scale-90 opacity-0 transition-[transform,opacity,filter] duration-[450ms] ease-[cubic-bezier(0.22,1,0.36,1)] dark:rotate-0 dark:scale-100 dark:opacity-100 dark:delay-[140ms] motion-reduce:transition-none"
        />
      </span>
    </Button>
  );
}
