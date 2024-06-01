import { DrizzleAdapter } from "@auth/drizzle-adapter";
import {
  getServerSession,
  type DefaultSession,
  type NextAuthOptions,
} from "next-auth";
import { type Adapter } from "next-auth/adapters";
import SpotifyProvider from "next-auth/providers/spotify";

import { env } from "~/env";
import { db } from "~/server/db";
import { createTable, accounts } from "~/server/db/schema";

import { eq, and } from "drizzle-orm";

/**
 * Module augmentation for `next-auth` types. Allows us to add custom properties to the `session`
 * object and keep type safety.
 *
 * @see https://next-auth.js.org/getting-started/typescript#module-augmentation
 */
declare module "next-auth" {
  interface Session extends DefaultSession {
    error: string;
    user: { id: string; name: string; image: string };
  }
}

/**
 * Options for NextAuth.js used to configure adapters, providers, callbacks, etc.
 *
 * @see https://next-auth.js.org/configuration/options
 */
export const authOptions: NextAuthOptions = {
  callbacks: {
    session: async ({ session, user }) => {
      const newSession = {
        ...session,
        user: { id: user.id, name: user.name, image: user.image },
      };

      const spotifyAccount = await db.query.accounts.findFirst({
        where: and(
          eq(accounts.provider, "spotify"),
          eq(accounts.userId, user.id),
        ),
      });

      if (
        !spotifyAccount?.expires_at ||
        !spotifyAccount?.refresh_token ||
        !spotifyAccount?.scope
      ) {
        return newSession;
      }

      if (spotifyAccount.expires_at * 1000 < Date.now()) {
        try {
          const basicAuth = Buffer.from(
            `${env.SPOTIFY_CLIENT_ID}:${env.SPOTIFY_CLIENT_SECRET}`,
          ).toString("base64");

          const response = await fetch(
            "https://accounts.spotify.com/api/token",
            {
              method: "POST",
              headers: {
                Authorization: `Basic ${basicAuth}`,
                "Content-Type": "application/x-www-form-urlencoded",
              },
              body: new URLSearchParams({
                grant_type: "refresh_token",
                client_id: env.SPOTIFY_CLIENT_ID,
                refresh_token: spotifyAccount.refresh_token,
                scope: spotifyAccount.scope,
              }),
            },
          );

          const tokens = await response.json();
          if (!response.ok) throw tokens;

          await db
            .update(accounts)
            .set({
              access_token: tokens.access_token,
              refresh_token: tokens.refresh_token,
              expires_at: Math.floor(Date.now() / 1000 + tokens.expires_in),
            })
            .where(
              and(
                eq(accounts.provider, "spotify"),
                eq(accounts.userId, user.id),
              ),
            );
        } catch (error) {
          console.error("Error refreshing access token", error);
          session.error = "RefreshAccessTokenError";
        }
      }

      return newSession;
    },
  },
  adapter: DrizzleAdapter(db, createTable) as Adapter,
  providers: [
    SpotifyProvider({
      clientId: env.SPOTIFY_CLIENT_ID,
      clientSecret: env.SPOTIFY_CLIENT_SECRET,
    }),
    /**
     * ...add more providers here.
     *
     * Most other providers require a bit more work than the Discord provider. For example, the
     * GitHub provider requires you to add the `refresh_token_expires_in` field to the Account
     * model. Refer to the NextAuth.js docs for the provider you want to use. Example:
     *
     * @see https://next-auth.js.org/providers/github
     */
  ],
};

/**
 * Wrapper for `getServerSession` so that you don't need to import the `authOptions` in every file.
 *
 * @see https://next-auth.js.org/configuration/nextjs
 */
export const getServerAuthSession = () => getServerSession(authOptions);
