
import { inngest } from '@/inngest/client';
import { baseProcedure, createTRPCRouter, ProtectedProcedure } from '../init';
import prisma from '@/lib/db';

export const appRouter = createTRPCRouter({
    getWorkFlows: ProtectedProcedure.query(({ctx}) => 
    {
      return prisma.workflow.findMany({
        
      });
    }),
    createWorkflow: ProtectedProcedure.mutation(async () => {
      await inngest.send({
        name: "test/hello.world",
        data: {
          email: "ahmad@email.com",
        }
      })

      return { success: true, message: "Job queded" }
    })
});

// export type definition of API
export type AppRouter = typeof appRouter; 