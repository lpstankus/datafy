import { z } from "zod";
import { createSelectSchema } from "drizzle-zod";

import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";
import { accounts } from "~/server/db/schema";
import { eq, and } from "drizzle-orm";

const ITEM_TARG = 100;
const MAX_REQUEST_ITEMS = 50;

const spotifyImageObject = z.object({
  url: z.string(),
  height: z.number().nullable(),
  width: z.number().nullable(),
});

const spotifyArtistObject = z.object({
  external_urls: z.object({ spotify: z.string().optional() }).optional(),
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
  artists: z.array(spotifyArtistObject).optional(),
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

type ArtistData = {
  spotify_id: string;
  name: string;
  genres: string[];
  popularity: number;
  followers: number;
};

type TrackData = {
  spotify_id: string;
  track_name: string;
  explicit: boolean;
  popularity: number;
  album_name: string;
  release_year: number;
  genres: string[];
  artists: string[];
};

const selectAccountSchema = createSelectSchema(accounts);
type Account = z.infer<typeof selectAccountSchema>;

type SpotifyTrackObject = z.infer<typeof spotifyTrackObject>;
type SpotifyArtistObject = z.infer<typeof spotifyArtistObject>;

async function fetchTopTracks(account: Account): Promise<SpotifyTrackObject[]> {
  var track_data: SpotifyTrackObject[] = [];
  try {
    for (
      var start = 0, len = Math.min(MAX_REQUEST_ITEMS, ITEM_TARG);
      start < ITEM_TARG;
      start += len, len = Math.min(ITEM_TARG - start, MAX_REQUEST_ITEMS)
    ) {
      const response = await fetch(
        "https://api.spotify.com/v1/me/top/tracks?" +
          new URLSearchParams({
            time_raunge: "short_term",
            limit: `${len}`,
            offset: `${start}`,
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

      const response_array = z.array(spotifyTrackObject).parse(json.items);
      track_data = track_data.concat(response_array);
    }
    return track_data;
  } catch (error) {
    console.error("Error requesting most played songs:", error);
    console.error(
      `Got ${track_data.length} tracks out of ${ITEM_TARG} requested`,
    );
    return track_data;
  }
}

function transformSpotifyResponse(data: SpotifyTrackObject[]): {
  artist_data: ArtistData[];
  track_data: TrackData[];
} {
  var artist_map = new Map<string, ArtistData>();
  var track_map = new Map<string, TrackData>();

  for (const track of data) {
    if (!track.id) continue;

    const track_artists = [];

    var genres_set = new Set<string>();
    for (const artist of track.artists || []) {
      artist.genres?.forEach((genre) => genres_set.add(genre));

      if (artist.id) {
        const artist_obj: ArtistData = {
          spotify_id: artist.id,
          name: artist.name || "Unknown",
          genres: artist.genres || [],
          popularity: artist.popularity || 0,
          followers: artist.followers?.total || 0,
        };

        artist_map.set(artist_obj.spotify_id, artist_obj);
        track_artists.push(artist_obj);
      }
    }

    const track_obj: TrackData = {
      track_name: track.name || "Untitled",
      spotify_id: track.id,
      album_name: track.album?.name || "Untitled",
      artists: track_artists.map((artist) => artist.spotify_id),
      release_year: parseInt(track.album?.release_date.split("-")[0] || "0"),
      explicit: track.explicit || false,
      popularity: track.popularity || 0,
      genres: Array.from(genres_set),
    };

    track_map.set(track_obj.spotify_id, track_obj);
  }

  return {
    artist_data: Array.from(artist_map.values()),
    track_data: Array.from(track_map.values()),
  };
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

  retrieveMostPlayed: publicProcedure
    .input(selectAccountSchema)
    .query(async ({ input: account }) => {
      const track_list = await fetchTopTracks(account);
      return transformSpotifyResponse(track_list);
    }),
});
