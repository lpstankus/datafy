import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { getServerSession, type DefaultSession, type NextAuthOptions } from "next-auth";
import { type Adapter } from "next-auth/adapters";
import SpotifyProvider from "next-auth/providers/spotify";

import { env } from "~/env";
import { db } from "~/server/db";
import { createTable, accounts, Account } from "~/server/db/schema";

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
      let account = await db.query.accounts.findFirst({
        where: and(eq(accounts.provider, "spotify"), eq(accounts.userId, user.id)),
      });
      if (!account) return session;

      let refreshedAccount = await refreshAccount(account);
      if (!refreshedAccount) return session;

      return {
        ...session,
        user: {
          id: user.id,
          name: user.name,
          image: user.image,
          spotify: {
            accountId: refreshedAccount.accountId,
            accessToken: refreshedAccount.accessToken,
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

export type RefreshedAccount = {
  userId: string; // id of user in datafy
  accountId: string; // id of user in spotify
  refreshToken: string;
  accessToken: string;
};

export async function refreshAccount(account: Account): Promise<RefreshedAccount | null> {
  if (!account.refresh_token) {
    console.error(`Invalid spotify account (no refresh token): ${account}`);
    return null;
  }

  if (!account.access_token || (account.expires_at || 0) * 1000 < Date.now()) {
    try {
      let authString = `${env.SPOTIFY_CLIENT_ID}:${env.SPOTIFY_CLIENT_SECRET}`;
      let basicAuth = Buffer.from(authString).toString("base64");

      let response = await fetch("https://accounts.spotify.com/api/token", {
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
      });

      let tokens = await response.json();
      if (!response.ok) throw tokens;

      await db
        .update(accounts)
        .set({
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
          expires_at: Math.floor(Date.now() / 1000) + tokens.expires_in,
        })
        .where(
          and(
            eq(accounts.provider, "spotify"),
            eq(accounts.providerAccountId, account.providerAccountId),
          ),
        );

      account.access_token = tokens.access_token;
      if (tokens.refresh_token) account.refresh_token = tokens.refresh_token;
    } catch (error) {
      console.error(`Error refreshing access token: ${error}`);
      return null;
    }
  }

  if (!account.access_token || !account.refresh_token) {
    console.error("Refreshed account lacks tokens: ", account);
    return null;
  }

  return {
    userId: account.userId,
    accountId: account.providerAccountId,
    refreshToken: account.refresh_token,
    accessToken: account.access_token,
  };
}
