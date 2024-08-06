import { z } from "zod";
import { sql, and, eq, max } from "drizzle-orm";
import { VercelPgDatabase } from "drizzle-orm/vercel-postgres";
import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";
import { refreshAccount } from "~/server/auth";
import * as schema from "~/server/db/schema";
import { TrackObject, ArtistObject } from "./extern_types";
import * as spotify from "./extern_api";

const ITEM_TARG = 10;

type ArtistData = {
  artists: schema.InsertArtist[];
  artist_genres: schema.InsertArtistGenre[];
};

type TrackData = {
  artists: schema.InsertArtist[];
  artist_genres: schema.InsertArtistGenre[];
  tracks: schema.InsertTrack[];
  track_genres: schema.InsertTrackGenre[];
  track_artists: schema.InsertTrackArtist[];
};

export const spotifyRouter = createTRPCRouter({
  fetchTopTracks: publicProcedure
    .input(z.object({ accessToken: z.string() }))
    .mutation(async ({ ctx, input }) => {
      let { accessToken } = input;
      let data = await fetchTopTracks(accessToken);
      saveTrackData(ctx.db, data);
    }),

  fetchTopArtists: publicProcedure
    .input(z.object({ accessToken: z.string() }))
    .mutation(async ({ ctx, input }) => {
      let { accessToken } = input;
      let data = await fetchTopArtists(accessToken);
      saveArtistData(ctx.db, data);
    }),

  // Fetch and save User's short term listening habits in Spotify
  // TODO: save top tracks and track metadata
  snapshotUser: publicProcedure
    .input(z.object({ userId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      let { userId } = input;
      const account = await ctx.db.query.accounts.findFirst({
        where: and(eq(schema.accounts.provider, "spotify"), eq(schema.accounts.userId, userId)),
      });

      if (!account) {
        console.error(`Failed to find spotify account for user: ${userId}`);
        return;
      }

      let refreshedAccount = await refreshAccount(account);
      if (!refreshedAccount) {
        console.error(`Failed to refresh spotify account for user: ${userId})`);
        return;
      }

      let data = await fetchTopTracks(refreshedAccount.accessToken);
      await saveTrackData(ctx.db, data);

      saveTrackList(ctx.db, userId, data.tracks);
    }),
});

async function saveArtistData(db: VercelPgDatabase<typeof schema>, data: ArtistData) {
  let artists_promise = db
    .insert(schema.artists)
    .values(data.artists)
    .onConflictDoUpdate({
      target: schema.artists.artistId,
      set: {
        name: sql`excluded."name"`,
        popularity: sql`excluded."popularity"`,
        followers: sql`excluded."followers"`,
      },
    });

  let artist_genres_promise = db
    .insert(schema.artistGenres)
    .values(data.artist_genres)
    .onConflictDoNothing();

  await artists_promise;
  await artist_genres_promise;
}

async function saveTrackData(db: VercelPgDatabase<typeof schema>, data: TrackData) {
  let tracks_promise = db
    .insert(schema.tracks)
    .values(data.tracks)
    .onConflictDoUpdate({
      target: schema.tracks.trackId,
      set: {
        trackName: sql`excluded."trackName"`,
        albumName: sql`excluded."albumName"`,
        releaseYear: sql`excluded."releaseYear"`,
        explicit: sql`excluded."explicit"`,
        popularity: sql`excluded."popularity"`,
      },
    });

  let artists_promise = db
    .insert(schema.artists)
    .values(data.artists)
    .onConflictDoUpdate({
      target: schema.artists.artistId,
      set: {
        name: sql`excluded."name"`,
        popularity: sql`excluded."popularity"`,
        followers: sql`excluded."followers"`,
      },
    });

  let artist_tracks_promise = db
    .insert(schema.trackArtists)
    .values(data.track_artists)
    .onConflictDoNothing();

  let track_genres_promise = db
    .insert(schema.trackGenres)
    .values(data.track_genres)
    .onConflictDoNothing();

  let artist_genres_promise = db
    .insert(schema.artistGenres)
    .values(data.artist_genres)
    .onConflictDoNothing();

  await tracks_promise;
  await artists_promise;
  await artist_tracks_promise;
  await track_genres_promise;
  await artist_genres_promise;
}

async function fetchTopArtists(accessToken: string): Promise<ArtistData> {
  let artist_data = await spotify.fetchTopArtists(accessToken, ITEM_TARG);
  let artists = processArtistsData(artist_data);
  let artist_genres = linkArtistGenres(artist_data);
  return { artists, artist_genres };
}

async function fetchTopTracks(accessToken: string): Promise<TrackData> {
  let track_data = await spotify.fetchTopTracks(accessToken, ITEM_TARG);
  let { tracks, track_artists } = processTracksData(track_data);

  let artist_ids = filterArtistIds(track_artists);
  let artist_data = await spotify.fetchArtistsData(accessToken, artist_ids);
  let artists = processArtistsData(artist_data);

  let { artist_genres, track_genres } = linkTrackGenres(track_data, artist_data);

  return { artists, artist_genres, tracks, track_genres, track_artists };
}

function processTracksData(track_data: TrackObject[]): {
  tracks: schema.InsertTrack[];
  track_artists: schema.InsertTrackArtist[];
} {
  let tracks: schema.InsertTrack[] = [];
  let track_artists: schema.InsertTrackArtist[] = [];

  for (let track of track_data) {
    if (!track.id) continue;

    for (let artist of track.artists || []) {
      if (!artist.id) continue;
      track_artists.push({
        trackId: track.id,
        artistId: artist.id,
      });
    }

    tracks.push({
      trackId: track.id,
      trackName: track.name || "Untitled",
      albumName: track.album?.name || "Untitled",
      releaseYear: parseInt(track.album?.release_date.split("-")[0] || "0"),
      explicit: track.explicit || false,
      popularity: track.popularity || 0,
    });
  }

  return { tracks, track_artists };
}

function filterArtistIds(track_artists: schema.InsertTrackArtist[]): string[] {
  return [...track_artists.reduce((acc, obj) => acc.add(obj.artistId), new Set<string>())];
}

function processArtistsData(artist_data: ArtistObject[]): schema.InsertArtist[] {
  let processed_artists: schema.InsertArtist[] = [];
  for (let artist of artist_data) {
    if (!artist.id) continue;
    let artist_obj: schema.InsertArtist = {
      artistId: artist.id,
      name: artist.name || "Unknown",
      popularity: artist.popularity || 0,
      followers: artist.followers?.total || 0,
    };
    processed_artists.push(artist_obj);
  }
  return processed_artists;
}

function linkArtistGenres(artist_data: ArtistObject[]): schema.InsertArtistGenre[] {
  let artistGenres: schema.InsertArtistGenre[] = [];
  for (let artist of artist_data) {
    if (!artist.id) continue;
    for (let genre of artist.genres || []) {
      artistGenres.push({
        artistId: artist.id,
        genre,
      });
    }
  }
  return artistGenres;
}

function linkTrackGenres(
  track_data: TrackObject[],
  artist_data: ArtistObject[],
): { track_genres: schema.InsertTrackGenre[]; artist_genres: schema.InsertArtistGenre[] } {
  let artist_genres_map = new Map<string, Set<string>>();
  for (let artist of artist_data) {
    if (!artist.id) continue;
    artist_genres_map.set(artist.id, new Set(artist.genres || []));
  }

  let track_genres: schema.InsertTrackGenre[] = [];
  for (let track of track_data) {
    if (!track.id) continue;
    let genres_set = new Set<string>();

    for (let artist of track.artists || []) {
      if (!artist.id) continue;
      let artist_genres = artist_genres_map.get(artist.id);
      if (artist_genres) artist_genres.forEach((genre) => genres_set.add(genre));
    }

    for (let genre of genres_set) {
      let track_genre: schema.InsertTrackGenre = {
        trackId: track.id,
        genre,
      };
      track_genres.push(track_genre);
    }
  }

  let artist_genres: schema.InsertArtistGenre[] = [];
  for (let pair of artist_genres_map) {
    let [id, genre_set] = pair;
    for (let genre of genre_set) {
      let artist_genre: schema.InsertArtistGenre = {
        artistId: id,
        genre,
      };
      artist_genres.push(artist_genre);
    }
  }

  return { artist_genres, track_genres };
}

async function saveTrackList(
  db: VercelPgDatabase<typeof schema>,
  userId: string,
  tracks: schema.InsertTrack[],
) {
  let generation_query = await db
    .select({ value: max(schema.trackLists.generation) })
    .from(schema.trackLists);

  let generation = 0;
  if (generation_query[0] && generation_query[0].value) {
    generation = generation_query[0].value + 1;
  }

  let trackList = tracks.reduce<schema.InsertTrackList[]>((acc, track) => {
    acc.push({
      userId,
      trackId: track.trackId,
      generation,
      ranking: acc.length,
      timestamp: new Date().toDateString(),
    });
    return acc;
  }, []);

  await db.insert(schema.trackLists).values(trackList);
}
