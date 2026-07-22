import { TRPCError } from "@trpc/server";
import type { NodeExecutor } from "@/features/workflow/server/executor-registry";
import type { Prisma } from "@/generated/prisma";
import { googleFormsWebhookPayloadSchema } from "../schema";

export const executeGoogleFormsTrigger: NodeExecutor = async ({
  triggerInput,
}) => {
  const parsed = googleFormsWebhookPayloadSchema.safeParse(triggerInput);

  if (!parsed.success) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Google Forms trigger input is invalid.",
    });
  }

  return { data: parsed.data as Prisma.JsonObject };
};
