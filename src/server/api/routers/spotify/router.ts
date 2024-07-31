import { z } from "zod";
import { SQL, sql } from "drizzle-orm";
import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";

import {
  tracks,
  artists,
  trackArtists,
  trackGenres,
  artistGenres,
  InsertTrack,
  InsertArtist,
  InsertTrackArtist,
  InsertTrackGenre,
  InsertArtistGenre,
} from "~/server/db/schema";

import { TrackObject, ArtistObject } from "./extern_types";
import { fetchArtistsData, fetchTopTracks } from "./extern_api";

const ITEM_TARG = 10;

export const spotifyRouter = createTRPCRouter({
  fetchTopTracks: publicProcedure
    .input(z.object({ accessToken: z.string() }))
    .mutation(async ({ ctx, input }) => {
      let { accessToken } = input;

      let track_data = await fetchTopTracks(accessToken, ITEM_TARG);
      let { ins_tracks, track_artists } = processTracksData(track_data);

      let artist_ids = filterArtistIds(track_artists);
      let artist_data = await fetchArtistsData(accessToken, artist_ids);
      let ins_artists = processArtistsData(artist_data);

      let { artist_genres, track_genres } = processGenres(track_data, artist_data);

      let tracks_promise = ctx.db
        .insert(tracks)
        .values(ins_tracks)
        .onConflictDoUpdate({
          target: tracks.trackId,
          set: {
            trackName: sql`excluded."trackName"`,
            albumName: sql`excluded."albumName"`,
            releaseYear: sql`excluded."releaseYear"`,
            explicit: sql`excluded."explicit"`,
            popularity: sql`excluded."popularity"`,
          },
        });

      let artists_promise = ctx.db
        .insert(artists)
        .values(ins_artists)
        .onConflictDoUpdate({
          target: artists.artistId,
          set: {
            name: sql`excluded."name"`,
            popularity: sql`excluded."popularity"`,
            followers: sql`excluded."followers"`,
          },
        });

      let artist_tracks_promise = ctx.db
        .insert(trackArtists)
        .values(track_artists)
        .onConflictDoNothing();

      let track_genres_promise = ctx.db
        .insert(trackGenres)
        .values(track_genres)
        .onConflictDoNothing();

      let artist_genres_promise = ctx.db
        .insert(artistGenres)
        .values(artist_genres)
        .onConflictDoNothing();

      await tracks_promise;
      await artists_promise;
      await artist_tracks_promise;
      await track_genres_promise;
      await artist_genres_promise;
    }),
});

function processTracksData(track_data: TrackObject[]): {
  ins_tracks: InsertTrack[];
  track_artists: InsertTrackArtist[];
} {
  let ins_tracks: InsertTrack[] = [];
  let track_artists: InsertTrackArtist[] = [];

  for (let track of track_data) {
    if (!track.id) continue;

    for (let artist of track.artists || []) {
      if (!artist.id) continue;
      track_artists.push({
        trackId: track.id,
        artistId: artist.id,
      });
    }

    ins_tracks.push({
      trackId: track.id,
      trackName: track.name || "Untitled",
      albumName: track.album?.name || "Untitled",
      releaseYear: parseInt(track.album?.release_date.split("-")[0] || "0"),
      explicit: track.explicit || false,
      popularity: track.popularity || 0,
    });
  }

  return { ins_tracks, track_artists };
}

function filterArtistIds(track_artists: InsertTrackArtist[]): string[] {
  return [...track_artists.reduce((acc, obj) => acc.add(obj.artistId), new Set<string>())];
}

function processArtistsData(artist_data: ArtistObject[]): InsertArtist[] {
  let processed_artists: InsertArtist[] = [];
  for (let artist of artist_data) {
    if (!artist.id) continue;
    let artist_obj: InsertArtist = {
      artistId: artist.id,
      name: artist.name || "Unknown",
      popularity: artist.popularity || 0,
      followers: artist.followers?.total || 0,
    };
    processed_artists.push(artist_obj);
  }
  return processed_artists;
}

function processGenres(
  track_data: TrackObject[],
  artist_data: ArtistObject[],
): { track_genres: InsertTrackGenre[]; artist_genres: InsertArtistGenre[] } {
  let artist_genres_map = new Map<string, Set<string>>();
  for (let artist of artist_data) {
    if (!artist.id) continue;
    artist_genres_map.set(artist.id, new Set(artist.genres || []));
  }

  let track_genres: InsertTrackGenre[] = [];
  for (let track of track_data) {
    if (!track.id) continue;
    let genres_set = new Set<string>();

    for (let artist of track.artists || []) {
      if (!artist.id) continue;
      let artist_genres = artist_genres_map.get(artist.id);
      if (artist_genres) artist_genres.forEach((genre) => genres_set.add(genre));
    }

    for (let genre of genres_set) {
      let track_genre: InsertTrackGenre = {
        trackId: track.id,
        genre,
      };
      track_genres.push(track_genre);
    }
  }

  let artist_genres: InsertArtistGenre[] = [];
  for (let pair of artist_genres_map) {
    let [id, genre_set] = pair;
    for (let genre of genre_set) {
      let artist_genre: InsertArtistGenre = {
        artistId: id,
        genre,
      };
      artist_genres.push(artist_genre);
    }
  }

  return { artist_genres, track_genres };
}
