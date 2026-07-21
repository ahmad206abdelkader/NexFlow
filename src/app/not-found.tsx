import { ArrowLeftIcon } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
} from "@/components/ui/empty";

export default function NotFound() {
  return (
    <main className="relative flex min-h-svh items-center justify-center overflow-hidden bg-muted/30 p-4 sm:p-6">
      <div
        aria-hidden="true"
        className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/50 to-transparent"
      />

      <Empty className="relative w-full max-w-xl border bg-background px-6 py-12 shadow-sm sm:px-12 sm:py-16">
        <EmptyHeader className="max-w-md gap-4">
          <EmptyMedia
            variant="icon"
            className="size-16 rounded-xl bg-primary/10 ring-1 ring-primary/20"
          >
            <Image
              src="/logos/logo.svg"
              alt=""
              width={40}
              height={40}
              priority
            />
          </EmptyMedia>

          <p className="font-mono text-sm font-semibold tracking-widest text-primary">
            ERROR 404
          </p>
          <h1 className="text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
            404 - Page Not Found
          </h1>
          <EmptyDescription className="max-w-sm text-base">
            The page you&apos;re looking for doesn&apos;t exist or may have been
            moved.
          </EmptyDescription>
        </EmptyHeader>

        <EmptyContent>
          <Button asChild size="lg">
            <Link href="/">
              <ArrowLeftIcon />
              Return to home
            </Link>
          </Button>
        </EmptyContent>
      </Empty>
    </main>
  );
}
