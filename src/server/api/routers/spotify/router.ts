import { z } from "zod";
import { sql, and, eq, max } from "drizzle-orm";
import { VercelPgDatabase } from "drizzle-orm/vercel-postgres";
import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";
import { refreshAccount } from "~/server/auth";
import * as schema from "~/server/db/schema";
import { TrackObject, ArtistObject, AudioFeatures } from "./extern_types";
import * as spotify from "./extern_api";

const ITEM_TARG = 10;
const SNAPSHOT_LIST_TARG = 100;

type ArtistData = {
  artists: schema.InsertArtist[];
  artist_genres: schema.InsertArtistGenre[];
};

type TrackData = {
  artists: schema.InsertArtist[];
  artist_genres: schema.InsertArtistGenre[];
  albums: schema.InsertAlbum[];
  album_artists: schema.InsertAlbumArtists[];
  tracks: schema.InsertTrack[];
  track_genres: schema.InsertTrackGenre[];
  track_artists: schema.InsertTrackArtist[];
  track_features: schema.InsertTrackFeatures[];
};

export const spotifyRouter = createTRPCRouter({
  fetchTopTracks: publicProcedure
    .input(z.object({ accessToken: z.string() }))
    .mutation(async ({ ctx, input }) => {
      let { accessToken } = input;
      let data = await fetchTopTracks(accessToken, ITEM_TARG);
      saveTrackData(ctx.db, data);
    }),

  fetchTopArtists: publicProcedure
    .input(z.object({ accessToken: z.string() }))
    .mutation(async ({ ctx, input }) => {
      let { accessToken } = input;
      let data = await fetchTopArtists(accessToken, ITEM_TARG);
      saveArtistData(ctx.db, data);
    }),

  // Fetch and save User's short term listening habits from Spotify
  snapshotUser: publicProcedure
    .input(z.object({ userId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      let { userId } = input;
      const account = await ctx.db.query.accounts.findFirst({
        where: and(eq(schema.accounts.provider, "spotify"), eq(schema.accounts.userId, userId)),
      });
      console.log(`Snapshot(${userId}): starting snapshot`);

      if (!account) {
        console.error(`Snapshot(${userId}): failed to find spotify account for user`);
        return;
      }

      let refreshedAccount = await refreshAccount(account);
      if (!refreshedAccount) {
        console.error(`Snapshot(${userId}): failed to refresh spotify tokens`);
        return;
      }

      let track_data = await fetchTopTracks(refreshedAccount.accessToken, SNAPSHOT_LIST_TARG);
      let track_save = saveTrackData(ctx.db, track_data);

      let artist_data = await fetchTopArtists(refreshedAccount.accessToken, SNAPSHOT_LIST_TARG);
      let artist_save = saveArtistData(ctx.db, artist_data);

      Promise.all([track_save, artist_save]);

      let tracklist_save = saveTrackList(ctx.db, userId, track_data.tracks);
      console.log(`Snapshot(${userId}): successfully saved tracks list`);

      let artistlist_save = saveArtistList(ctx.db, userId, artist_data.artists);
      console.log(`Snapshot(${userId}): successfully saved artists list`);

      await Promise.all([tracklist_save, artistlist_save]);
      console.log(`Snapshot(${userId}): snapshot completed successfully`);
    }),
});

async function saveArtistData(db: VercelPgDatabase<typeof schema>, data: ArtistData) {
  await db
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
  await db.insert(schema.artistGenres).values(data.artist_genres).onConflictDoNothing();
}

async function saveTrackData(db: VercelPgDatabase<typeof schema>, data: TrackData) {
  let promises: Promise<any>[] = [];
  promises.push(
    db
      .insert(schema.albums)
      .values(data.albums)
      .onConflictDoUpdate({
        target: schema.albums.albumId,
        set: {
          name: sql`excluded."name"`,
          type: sql`excluded."type"`,
          totalTracks: sql`excluded."totalTracks"`,
          releaseYear: sql`excluded."releaseYear"`,
          imageURL: sql`excluded."imageURL"`,
        },
      }),
  );

  promises.push(
    db
      .insert(schema.tracks)
      .values(data.tracks)
      .onConflictDoUpdate({
        target: schema.tracks.trackId,
        set: {
          trackName: sql`excluded."trackName"`,
          explicit: sql`excluded."explicit"`,
          popularity: sql`excluded."popularity"`,
          albumId: sql`excluded."albumId"`,
        },
      }),
  );

  promises.push(
    db
      .insert(schema.artists)
      .values(data.artists)
      .onConflictDoUpdate({
        target: schema.artists.artistId,
        set: {
          name: sql`excluded."name"`,
          popularity: sql`excluded."popularity"`,
          followers: sql`excluded."followers"`,
        },
      }),
  );

  promises.push(
    db
      .insert(schema.tracksFeatures)
      .values(data.track_features)
      .onConflictDoUpdate({
        target: schema.tracksFeatures.trackId,
        set: {
          duration: sql`excluded."duration"`,
          acousticness: sql`excluded."acousticness"`,
          danceability: sql`excluded."danceability"`,
          instrumentalness: sql`excluded."instrumentalness"`,
          liveness: sql`excluded."liveness"`,
          loudness: sql`excluded."loudness"`,
          speechiness: sql`excluded."speechiness"`,
          energy: sql`excluded."energy"`,
          valence: sql`excluded."valence"`,
          key: sql`excluded."key"`,
          mode: sql`excluded."mode"`,
          tempo: sql`excluded."tempo"`,
          timeSignature: sql`excluded."timeSignature"`,
        },
      }),
  );

  promises.push(db.insert(schema.albumArtists).values(data.album_artists).onConflictDoNothing());
  promises.push(db.insert(schema.trackArtists).values(data.track_artists).onConflictDoNothing());
  promises.push(db.insert(schema.trackGenres).values(data.track_genres).onConflictDoNothing());
  promises.push(db.insert(schema.artistGenres).values(data.artist_genres).onConflictDoNothing());
}

async function fetchTopArtists(accessToken: string, item_targ: number): Promise<ArtistData> {
  let artist_data = await spotify.fetchTopArtists(accessToken, item_targ);
  let artists = processArtistsData(artist_data);
  let artist_genres = linkArtistGenres(artist_data);
  return { artists, artist_genres };
}

async function fetchTopTracks(accessToken: string, item_targ: number): Promise<TrackData> {
  let track_data = await spotify.fetchTopTracks(accessToken, item_targ);
  let { tracks, track_artists, albums, album_artists } = processTracksData(track_data);

  let track_ids = tracks.reduce<string[]>((acc, track) => acc.concat([track.trackId]), []);
  let track_features_data = await spotify.fetchTracksFeatures(accessToken, track_ids);
  let track_features = processTrackFeatData(track_features_data);

  let artist_ids = filterArtistIds(track_artists, album_artists);
  let artist_data = await spotify.fetchArtistsData(accessToken, artist_ids);
  let artists = processArtistsData(artist_data);

  let { artist_genres, track_genres } = linkTrackGenres(track_data, artist_data);

  return {
    artists,
    artist_genres,
    albums,
    album_artists,
    tracks,
    track_genres,
    track_artists,
    track_features,
  };
}

function processTracksData(track_data: TrackObject[]): {
  tracks: schema.InsertTrack[];
  track_artists: schema.InsertTrackArtist[];
  albums: schema.InsertAlbum[];
  album_artists: schema.InsertAlbumArtists[];
} {
  let tracks: schema.InsertTrack[] = [];
  let track_artists: schema.InsertTrackArtist[] = [];
  let album_map = new Map<string, schema.InsertAlbum>();
  let album_artists_map = new Map<string, string[]>();

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
      explicit: track.explicit || false,
      popularity: track.popularity || 0,
      albumId: track.album?.id || null,
    });

    if (!track.album) continue;
    album_map.set(track.album.id, {
      albumId: track.album.id,
      name: track.album.name || null,
      type: track.album.album_type || null,
      releaseYear: parseInt(track.album?.release_date.split("-")[0] || "") || null,
      totalTracks: track.album.total_tracks || null,
      imageURL: track.album.images?.[0]?.url || null,
    });
    album_artists_map.set(
      track.album.id,
      (track.album.artists || []).filter((a) => a.id).map((a) => a.id || ""),
    );
  }

  let albums = [...album_map.values()];
  let album_artists: schema.InsertAlbumArtists[] = [];
  album_artists_map.forEach((val, key) => {
    for (let artist of val) album_artists.push({ albumId: key, artistId: artist });
  });

  return { tracks, track_artists, albums, album_artists };
}

function filterArtistIds(
  track_artists: schema.InsertTrackArtist[],
  album_artists: schema.InsertAlbumArtists[],
): string[] {
  let ids = new Set<string>();
  track_artists.forEach((obj) => ids.add(obj.artistId));
  album_artists.forEach((obj) => ids.add(obj.artistId));
  return [...ids];
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
      imageURL: artist.images?.[0]?.url || null,
    };
    processed_artists.push(artist_obj);
  }
  return processed_artists;
}

function processTrackFeatData(track_features_data: AudioFeatures[]): schema.InsertTrackFeatures[] {
  let processed_track_features: schema.InsertTrackFeatures[] = [];
  for (let track_features of track_features_data) {
    if (!track_features.track_id) continue;
    processed_track_features.push({
      trackId: track_features.track_id,
      duration: track_features.duration_ms || 0,
      acousticness: track_features.acousticness || 0,
      danceability: track_features.danceability || 0,
      instrumentalness: track_features.instrumentalness || 0,
      liveness: track_features.liveness || 0,
      loudness: track_features.loudness || 0,
      speechiness: track_features.speechiness || 0,
      energy: track_features.energy || 0,
      valence: track_features.valence || 0,
      key: track_features.key || 0,
      mode: track_features.mode || 0,
      tempo: track_features.tempo || 0,
      timeSignature: track_features.time_signature || 0,
    });
  }
  return processed_track_features;
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
    .from(schema.trackLists)
    .where(eq(schema.trackLists.userId, userId));
  let generation = (generation_query[0]?.value || 0) + 1;

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

async function saveArtistList(
  db: VercelPgDatabase<typeof schema>,
  userId: string,
  artists: schema.InsertArtist[],
) {
  let generation_query = await db
    .select({ value: max(schema.artistLists.generation) })
    .from(schema.artistLists)
    .where(eq(schema.artistLists.userId, userId));
  let generation = (generation_query[0]?.value || 0) + 1;

  let artistList = artists.reduce<schema.InsertArtistList[]>((acc, artist) => {
    acc.push({
      userId,
      artistId: artist.artistId,
      generation,
      ranking: acc.length,
      timestamp: new Date().toDateString(),
    });
    return acc;
  }, []);

  await db.insert(schema.artistLists).values(artistList);
}
