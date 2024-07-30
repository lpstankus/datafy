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

const SPOTIFY_SCOPE = "user-read-email user-top-read";

declare module "next-auth" {
  interface Session extends DefaultSession {
    error: string;
    user: {
      id: string;
      name: string;
      image: string;
      spotify: {
        accountId: string;
        accessToken: string;
      };
    };
  }
}

export const authOptions: NextAuthOptions = {
  callbacks: {
    session: async ({ session, user }) => {
      const account = await db.query.accounts.findFirst({
        where: and(
          eq(accounts.provider, "spotify"),
          eq(accounts.userId, user.id),
        ),
      });
      if (!account || !account.refresh_token) throw "Invalid Spotify account";

      if (!account.expires_at || account.expires_at * 1000 < Date.now()) {
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
                refresh_token: account.refresh_token,
                scope: SPOTIFY_SCOPE,
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

          account.access_token = tokens.access_token;
        } catch (error) {
          throw `Error refreshing access token: ${error}`;
        }
      }

      return {
        ...session,
        user: {
          id: user.id,
          name: user.name,
          image: user.image,
          spotify: {
            accountId: account.providerAccountId,
            accessToken: account.access_token,
          },
        },
      };
    },
  },
  adapter: DrizzleAdapter(db, createTable) as Adapter,
  providers: [
    SpotifyProvider({
      clientId: env.SPOTIFY_CLIENT_ID,
      clientSecret: env.SPOTIFY_CLIENT_SECRET,
      authorization: { params: { scope: SPOTIFY_SCOPE } },
    }),
  ],
};

export const getServerAuthSession = () => getServerSession(authOptions);
