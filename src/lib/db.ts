import { PrismaClient } from "@/generated/prisma/client";
// for classes

const globalForPrisma = global as unknown as {
    prisma: PrismaClient;
}
//as unknown --> type script dont know wt is global and prisma here we tell with him dont judged for it 

const prisma = globalForPrisma.prisma || new PrismaClient();
//for connection and save & must if you have old save or not because dont save more connection global

if(process.env.NODE_ENV !== "production"){
    globalForPrisma.prisma = prisma;
}
//(production)this line talk with nodejs if we in phase development not on the real server get the copy from prisma it we created now and seved now to the global

export default prisma;

// all of this for  (((((hot reload)))))