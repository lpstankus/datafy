import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";

import { createSelectSchema } from "drizzle-zod";
import { accounts } from "~/server/db/schema";
const selectAccountSchema = createSelectSchema(accounts);
type Account = z.infer<typeof selectAccountSchema>;

import { TrackObject } from "./extern_types";

import { fetchArtistsData, fetchTopTracks } from "./extern_api";

const ITEM_TARG = 1;

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

function getArtistIds(data: TrackObject[]): string[] {
  const artist_ids = new Set<string>();
  for (const track of data) {
    if (!track.id) continue;
    for (const artist of track.artists || []) {
      if (artist.id) artist_ids.add(artist.id);
    }
  }
  return Array.from(artist_ids.values());
}

async function transformSpotifyResponse(
  accessToken: string,
  track_data: TrackObject[],
): Promise<{
  artist_data: ArtistData[];
  track_data: TrackData[];
}> {
  var artist_map = new Map<string, ArtistData>();
  var track_map = new Map<string, TrackData>();

  const artist_ids = getArtistIds(track_data);
  const artist_data = await fetchArtistsData(accessToken, artist_ids);

  for (const artist of artist_data) {
    if (!artist.id) continue;

    const artist_obj: ArtistData = {
      spotify_id: artist.id,
      name: artist.name || "Unknown",
      genres: artist.genres || [],
      popularity: artist.popularity || 0,
      followers: artist.followers?.total || 0,
    };

    artist_map.set(artist_obj.spotify_id, artist_obj);
  }

  for (const track of track_data) {
    if (!track.id) continue;

    var track_artist_ids: string[] = [];

    var genres_set = new Set<string>();
    for (const artist of track.artists || []) {
      if (!artist.id) continue;
      track_artist_ids.push(artist.id);
      const genres = artist_map.get(artist.id)?.genres;
      for (const genre of genres || []) genres_set.add(genre);
    }

    const track_obj: TrackData = {
      track_name: track.name || "Untitled",
      spotify_id: track.id,
      album_name: track.album?.name || "Untitled",
      release_year: parseInt(track.album?.release_date.split("-")[0] || "0"),
      artists: track_artist_ids,
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
  retrieveMostPlayed: publicProcedure.query(async ({ ctx }) => {
    let accessToken = ctx.session?.user.spotify.accessToken;
    if (!accessToken) return null;

    const track_data = await fetchTopTracks(accessToken, ITEM_TARG);
    return await transformSpotifyResponse(accessToken, track_data);
  }),
});
