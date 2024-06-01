import { z } from "zod";
import { createSelectSchema } from "drizzle-zod";

import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";
import { accounts } from "~/server/db/schema";
import { eq, and } from "drizzle-orm";

const TRACKLIST_LIMIT = 5;

const spotifyImageObject = z.object({
  url: z.string(),
  height: z.number().nullable(),
  width: z.number().nullable(),
});

const spotifyTrackObject = z.object({
  album: z
    .object({
      album_type: z.string(),
      total_tracks: z.number(),
      available_markets: z.array(z.string()),
      external_urls: z.object({ spotify: z.string().optional() }),
      href: z.string(),
      id: z.string(),
      images: z.array(spotifyImageObject),
      name: z.string(),
      release_date: z.string(),
      release_date_precision: z.string(),
      restrictions: z.object({ reason: z.string().optional() }).optional(),
      type: z.string(),
      uri: z.string(),
      artists: z.array(
        z.object({
          external_urls: z
            .object({ spotify: z.string().optional() })
            .optional(),
          href: z.string().optional(),
          id: z.string().optional(),
          name: z.string().optional(),
          type: z.string().optional(),
          uri: z.string().optional(),
        }),
      ),
    })
    .optional(),
  artists: z
    .array(
      z.object({
        external_urls: z.object({ spotify: z.string() }).optional(),
        followers: z
          .object({
            href: z.string().nullable().optional(),
            total: z.number().optional(),
          })
          .optional(),
        genres: z.array(z.string()).optional(),
        href: z.string().optional(),
        id: z.string().optional(),
        images: z.array(spotifyImageObject).optional(),
        name: z.string().optional(),
        popularity: z.number().optional(),
        type: z.string().optional(),
        uri: z.string().optional(),
      }),
    )
    .optional(),
  available_markets: z.array(z.string()).optional(),
  disc_number: z.number().optional(),
  duration_ms: z.number().optional(),
  explicit: z.boolean().optional(),
  external_ids: z
    .object({
      isrc: z.string().optional(),
      ean: z.string().optional(),
      upc: z.string().optional(),
    })
    .optional(),
  external_urls: z.object({ spotify: z.string().optional() }).optional(),
  playable: z.boolean().optional(),
  linked_from: z.object({}).optional(),
  href: z.string().optional(),
  id: z.string().optional(),
  restrictions: z.object({ reason: z.string().optional() }).optional(),
  name: z.string().optional(),
  popularity: z.number().optional(),
  preview_url: z.string().nullable().optional(),
  track_number: z.number().optional(),
  type: z.string().optional(),
  uri: z.string().optional(),
  is_local: z.boolean().optional(),
});

const selectAccountSchema = createSelectSchema(accounts);
type Account = z.infer<typeof selectAccountSchema>;
type SpotifyTrackObject = z.infer<typeof spotifyTrackObject>;

async function fetchTopTracks(account: Account): Promise<SpotifyTrackObject[]> {
  try {
    const response = await fetch(
      "https://api.spotify.com/v1/me/top/tracks?" +
        new URLSearchParams({
          time_raunge: "short_term",
          limit: `${TRACKLIST_LIMIT}`,
          offset: "0",
        }),
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${account.access_token}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
      },
    );

    const json = await response.json();
    if (!response.ok) throw json;

    return z.array(spotifyTrackObject).parse(json.items) || [];
  } catch (error) {
    console.error("Error requesting most played songs", error);
    return [];
  }
}

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
