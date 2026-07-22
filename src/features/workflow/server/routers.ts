import { TRPCError } from "@trpc/server";
import type { Edge, Node } from "@xyflow/react";
import { generateSlug } from "random-word-slugs";
import z from "zod";
import { PAGINATION } from "@/config/constants";
import {
  NodeType,
  type Prisma,
  type WorkflowExecution,
} from "@/generated/prisma";
import { inngest, WORKFLOW_EXECUTION_REQUESTED_EVENT } from "@/inngest/client";
import prisma from "@/lib/db";
import {
  createTRPCRouter,
  ProtectedProcedure,
  premiumProcedure,
} from "@/trpc/init";

const activeExecutionStatuses = ["PENDING", "RUNNING"] as const;

const toExecutionResponse = (execution: {
  id: string;
  workflowId: string;
  triggerNodeId: string;
  status: "PENDING" | "RUNNING" | "SUCCESS" | "FAILED";
}) => ({
  executionId: execution.id,
  workflowId: execution.workflowId,
  triggerNodeId: execution.triggerNodeId,
  status: execution.status,
});

export const workflowsRouter = createTRPCRouter({
  create: premiumProcedure.mutation(({ ctx }) => {
    return prisma.workflow.create({
      data: {
        name: generateSlug(3),
        userId: ctx.auth.user.id,
        nodes: {
          create: {
            type: NodeType.INITIAL,
            position: { x: 0, y: 0 },
            name: NodeType.INITIAL,
          },
        },
      },
    });
  }),
  remove: ProtectedProcedure.input(z.object({ id: z.string() })).mutation(
    ({ ctx, input }) => {
      return prisma.workflow.delete({
        where: {
          id: input.id,
          userId: ctx.auth.user.id,
        },
      });
    },
  ),
  update: ProtectedProcedure.input(
    z.object({
      id: z.string(),
      nodes: z.array(
        z.object({
          id: z.string(),
          type: z.enum(NodeType),
          position: z.object({ x: z.number(), y: z.number() }),
          data: z.record(z.string(), z.unknown()).optional(),
        }),
      ),
      edges: z.array(
        z.object({
          source: z.string(),
          target: z.string(),
          sourceHandle: z.string().nullish(),
          targetHandle: z.string().nullish(),
        }),
      ),
    }),
  ).mutation(async ({ ctx, input }) => {
    const { id, nodes, edges } = input;

    await prisma.workflow.findUniqueOrThrow({
      where: { id, userId: ctx.auth.user.id },
    });

    return await prisma.$transaction(async (tx) => {
      //delete existing nodes and connections
      await tx.node.deleteMany({
        where: { workflowId: id },
      });

      // create nodes

      await tx.node.createMany({
        data: nodes.map((node) => ({
          id: node.id,
          workflowId: id,
          name: node.type,
          type: node.type,
          position: node.position,
          data: (node.data ?? {}) as Prisma.InputJsonValue,
        })),
      });

      await tx.connection.createMany({
        data: edges.map((edge) => ({
          workflowId: id,
          fromNodeId: edge.source,
          toNodeId: edge.target,
          fromOutput: edge.sourceHandle || "main",
          toInput: edge.targetHandle || "main",
        })),
      });

      return tx.workflow.update({
        where: { id },
        data: { updatedAt: new Date() },
      });
    });
  }),
  updateName: ProtectedProcedure.input(
    z.object({ id: z.string(), name: z.string().min(1) }),
  ).mutation(({ ctx, input }) => {
    return prisma.workflow.update({
      where: {
        id: input.id,
        userId: ctx.auth.user.id,
      },
      data: {
        name: input.name,
      },
    });
  }),
  execute: ProtectedProcedure.input(z.object({ id: z.string() })).mutation(
    async ({ ctx, input }) => {
      const workflow = await prisma.workflow.findUniqueOrThrow({
        where: { id: input.id, userId: ctx.auth.user.id },
        include: { nodes: true },
      });

      const triggers = workflow.nodes.filter(
        (node) => node.type === NodeType.MANUAL_TRIGGER,
      );

      if (triggers.length !== 1) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "The workflow must contain exactly one manual trigger.",
        });
      }

      const activeExecution = await prisma.workflowExecution.findFirst({
        where: {
          workflowId: workflow.id,
          userId: ctx.auth.user.id,
          status: { in: [...activeExecutionStatuses] },
        },
        orderBy: { createdAt: "desc" },
      });

      if (activeExecution) {
        return toExecutionResponse(activeExecution);
      }

      let execution: WorkflowExecution;

      try {
        execution = await prisma.workflowExecution.create({
          data: {
            workflowId: workflow.id,
            userId: ctx.auth.user.id,
            triggerNodeId: triggers[0].id,
            status: "PENDING",
          },
        });
      } catch (error) {
        const concurrentExecution = await prisma.workflowExecution.findFirst({
          where: {
            workflowId: workflow.id,
            userId: ctx.auth.user.id,
            status: { in: [...activeExecutionStatuses] },
          },
          orderBy: { createdAt: "desc" },
        });

        if (!concurrentExecution) {
          throw error;
        }

        return toExecutionResponse(concurrentExecution);
      }

      try {
        await inngest.send({
          id: execution.id,
          name: WORKFLOW_EXECUTION_REQUESTED_EVENT,
          data: {
            workflowId: workflow.id,
            executionId: execution.id,
            userId: ctx.auth.user.id,
            triggerNodeId: triggers[0].id,
          },
        });
      } catch (error) {
        await prisma.workflowExecution.update({
          where: { id: execution.id },
          data: {
            status: "FAILED",
            error: "Workflow execution could not be queued.",
            completedAt: new Date(),
          },
        });

        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Workflow execution could not be queued.",
          cause: error,
        });
      }

      return toExecutionResponse(execution);
    },
  ),
  getLatestExecution: ProtectedProcedure.input(
    z.object({ workflowId: z.string() }),
  ).query(({ ctx, input }) => {
    return prisma.workflowExecution.findFirst({
      where: {
        workflowId: input.workflowId,
        userId: ctx.auth.user.id,
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        workflowId: true,
        triggerNodeId: true,
        status: true,
        error: true,
        startedAt: true,
        completedAt: true,
        createdAt: true,
      },
    });
  }),
  getOne: ProtectedProcedure.input(z.object({ id: z.string() })).query(
    async ({ ctx, input }) => {
      const workflow = await prisma.workflow.findUniqueOrThrow({
        where: { id: input.id, userId: ctx.auth.user.id },
        include: { nodes: true, connections: true },
      });

      // transform server nodes to react flow compatible nodes
      const nodes: Node[] = workflow.nodes.map((node) => ({
        id: node.id,
        type: node.type,
        position: node.position as { x: number; y: number },
        data: (node.data as Record<string, unknown>) || {},
      }));

      // transform server connectios to react flow compatible edges
      const edges: Edge[] = workflow.connections.map((connection) => ({
        id: connection.id,
        source: connection.fromNodeId,
        target: connection.toNodeId,
        sourceHandle: connection.fromOutput,
        targetHandle: connection.toInput,
      }));

      return {
        id: workflow.id,
        name: workflow.name,
        nodes,
        edges,
      };
    },
  ),
  getMany: ProtectedProcedure.input(
    z.object({
      page: z.number().default(PAGINATION.DEFAULT_PAGE),
      pageSize: z
        .number()
        .min(PAGINATION.MIN_PAGE_SIZE)
        .max(PAGINATION.MAX_PAGE_SIZE)
        .default(PAGINATION.DEFAULT_PAGE_SIZE),
      search: z.string().default(""),
    }),
  ).query(async ({ ctx, input }) => {
    const { page, pageSize, search } = input;

    const [items, totalCount] = await Promise.all([
      prisma.workflow.findMany({
        skip: (page - 1) * pageSize,
        take: pageSize,
        where: {
          userId: ctx.auth.user.id,
          name: {
            contains: search,
            mode: "insensitive",
          },
        },
        orderBy: {
          updatedAt: "desc",
        },
      }),
      prisma.workflow.count({
        where: {
          userId: ctx.auth.user.id,
          name: {
            contains: search,
            mode: "insensitive",
          },
        },
      }),
    ]);

    const totalPages = Math.ceil(totalCount / pageSize);
    const hasNextPage = page < totalPages;
    const hasPreviousPage = page > 1;

    return {
      items,
      page,
      pageSize,
      totalCount,
      totalPages,
      hasNextPage,
      hasPreviousPage,
    };
  }),
});
