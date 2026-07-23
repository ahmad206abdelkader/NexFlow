import { createId } from "@paralleldrive/cuid2";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { NodeType } from "@/generated/prisma";
import prisma from "@/lib/db";
import { createTRPCRouter, ProtectedProcedure } from "@/trpc/init";
import {
  generateGoogleFormsWebhookSecret,
  hashGoogleFormsWebhookSecret,
} from "./secret";

const webhookIdentitySchema = z.object({
  workflowId: z.string().min(1),
  triggerNodeId: z.string().min(1),
});

export const getPublicApplicationUrl = () => {
  const configuredUrl =
    process.env.BETTER_AUTH_URL ??
    (process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : undefined) ??
    (process.env.NODE_ENV === "development"
      ? "http://localhost:3000"
      : undefined);

  if (!configuredUrl) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "The application URL is not configured.",
    });
  }

  let url: URL;
  try {
    url = new URL(configuredUrl);
  } catch {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "The application URL is invalid.",
    });
  }

  if (!["http:", "https:"].includes(url.protocol)) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "The application URL is invalid.",
    });
  }

  return url.origin;
};

const toPublicConfiguration = (configuration: {
  publicId: string;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
  lastReceivedAt: Date | null;
}) => ({
  webhookId: configuration.publicId,
  webhookUrl: `${getPublicApplicationUrl()}/api/webhooks/google-forms/${configuration.publicId}`,
  enabled: configuration.enabled,
  createdAt: configuration.createdAt,
  updatedAt: configuration.updatedAt,
  lastReceivedAt: configuration.lastReceivedAt,
});

type OwnedGoogleFormsTrigger = { id: string; type: NodeType };
type FindOwnedGoogleFormsTrigger = (input: {
  workflowId: string;
  triggerNodeId: string;
  userId: string;
}) => Promise<OwnedGoogleFormsTrigger | null>;

const findOwnedGoogleFormsTrigger: FindOwnedGoogleFormsTrigger = async ({
  workflowId,
  triggerNodeId,
  userId,
}) => {
  const workflow = await prisma.workflow.findFirst({
    where: { id: workflowId, userId },
    select: {
      id: true,
      nodes: {
        where: { id: triggerNodeId },
        select: { id: true, type: true },
      },
    },
  });

  return workflow?.nodes[0] ?? null;
};

export const authorizeGoogleFormsTrigger = async (
  input: {
    workflowId: string;
    triggerNodeId: string;
    userId: string;
  },
  lookup: FindOwnedGoogleFormsTrigger = findOwnedGoogleFormsTrigger,
) => {
  const triggerNode = await lookup(input);
  if (triggerNode?.type !== NodeType.googleFormsTrigger) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "The Google Forms trigger was not found.",
    });
  }

  return triggerNode;
};

export const googleFormsWebhooksRouter = createTRPCRouter({
  get: ProtectedProcedure.input(webhookIdentitySchema).query(
    async ({ ctx, input }) => {
      await authorizeGoogleFormsTrigger({
        ...input,
        userId: ctx.auth.user.id,
      });

      const configuration = await prisma.googleFormsWebhook.findFirst({
        where: {
          workflowId: input.workflowId,
          triggerNodeId: input.triggerNodeId,
          userId: ctx.auth.user.id,
        },
      });

      return configuration ? toPublicConfiguration(configuration) : null;
    },
  ),
  ensure: ProtectedProcedure.input(webhookIdentitySchema).mutation(
    async ({ ctx, input }) => {
      await authorizeGoogleFormsTrigger({
        ...input,
        userId: ctx.auth.user.id,
      });

      const existing = await prisma.googleFormsWebhook.findFirst({
        where: {
          workflowId: input.workflowId,
          triggerNodeId: input.triggerNodeId,
          userId: ctx.auth.user.id,
        },
      });

      if (existing) {
        return { ...toPublicConfiguration(existing), secret: null };
      }

      const secret = generateGoogleFormsWebhookSecret();
      const secretHash = await hashGoogleFormsWebhookSecret(secret);

      try {
        const configuration = await prisma.googleFormsWebhook.create({
          data: {
            publicId: createId(),
            secretHash,
            userId: ctx.auth.user.id,
            workflowId: input.workflowId,
            triggerNodeId: input.triggerNodeId,
          },
        });

        return { ...toPublicConfiguration(configuration), secret };
      } catch (error) {
        const concurrent = await prisma.googleFormsWebhook.findFirst({
          where: {
            workflowId: input.workflowId,
            triggerNodeId: input.triggerNodeId,
            userId: ctx.auth.user.id,
          },
        });

        if (!concurrent) {
          throw error;
        }

        return { ...toPublicConfiguration(concurrent), secret: null };
      }
    },
  ),
  regenerateSecret: ProtectedProcedure.input(webhookIdentitySchema).mutation(
    async ({ ctx, input }) => {
      await authorizeGoogleFormsTrigger({
        ...input,
        userId: ctx.auth.user.id,
      });

      const secret = generateGoogleFormsWebhookSecret();
      const secretHash = await hashGoogleFormsWebhookSecret(secret);
      const configuration = await prisma.googleFormsWebhook.update({
        where: {
          workflowId_triggerNodeId: {
            workflowId: input.workflowId,
            triggerNodeId: input.triggerNodeId,
          },
          userId: ctx.auth.user.id,
        },
        data: { secretHash, enabled: true },
      });

      return { ...toPublicConfiguration(configuration), secret };
    },
  ),
});
