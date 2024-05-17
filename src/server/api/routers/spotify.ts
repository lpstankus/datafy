import { z } from "zod";

import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";
import { accounts } from "~/server/db/schema";
import { eq, and } from "drizzle-orm";

export const spotifyRouter = createTRPCRouter({
  getAccount: publicProcedure
    .input(z.object({ user: z.string() }))
    .query(({ ctx, input }) => {
      return ctx.db.query.accounts.findFirst({
        where: and(
          eq(accounts.userId, input.user),
          eq(accounts.provider, "spotify"),
        ),
      });
    }),
});
