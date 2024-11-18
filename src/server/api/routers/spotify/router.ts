import { z } from "zod";
import { sql, and, eq, or } from "drizzle-orm";
import { VercelPgDatabase } from "drizzle-orm/vercel-postgres";
import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";
import { refreshAccount, RefreshedAccount } from "~/server/auth";
import * as schema from "~/server/db/schema";
import * as spotify from "./extern_api";

type SnapshotData = {
  tracks: schema.InsertTrack[];
  trackArtists: schema.InsertTrackArtist[];
  trackFeatures: schema.InsertTrackFeatures[];
  trackGenres: schema.InsertTrackGenre[];

  artists: schema.InsertArtist[];
  artistGenres: schema.InsertArtistGenre[];

  albums: schema.InsertAlbum[];
  albumArtists: schema.InsertAlbumArtists[];

  trackRankings: schema.InsertTrackRanking[];
  artistRankings: schema.InsertArtistRanking[];
};

const SNAPSHOT_LIST_TARG = 100;

export const spotifyRouter = createTRPCRouter({
  // Fetch and save User's short term listening habits from Spotify
  snapshotUsers: publicProcedure
    .input(z.object({ userIds: z.array(z.string()) }))
    .mutation(async ({ ctx, input }) => {
      let { userIds } = input;
      console.log("snapshot: starting snapshot for users:", userIds);

      const accounts = await fetchAndRefreshAccounts(ctx.db, userIds);
      const refreshedIds = accounts.map((a) => a.userId);
      console.log("snapshot: refreshed accounts of users:", refreshedIds);

      const snapshotData = await fetchSnapshotData(accounts, SNAPSHOT_LIST_TARG);
      console.log("Snapshot: fetched data, saving to database...");

      await saveSnapshot(ctx.db, snapshotData);
      console.log("Snapshot: snapshot successful for refreshed users");
    }),
});

async function fetchAndRefreshAccounts(
  db: VercelPgDatabase<typeof schema>,
  userIds: string[],
): Promise<RefreshedAccount[]> {
  const dbAccounts = await db.query.accounts.findMany({
    where: and(
      eq(schema.accounts.provider, "spotify"),
      or(...userIds.map((id) => eq(schema.accounts.userId, id))),
    ),
  });

  if (userIds.length !== dbAccounts.length) {
    const ids = new Map(dbAccounts.map((account) => [account.userId, account]));
    userIds = userIds.filter((id) => {
      if (!ids.has(id)) {
        console.error(`Snapshot(${id}): account not found, aborting for user`);
        return false;
      }
      return true;
    });
  }

  const maybeAccounts = await Promise.all(dbAccounts.map((account) => refreshAccount(account)));
  const accounts = maybeAccounts.filter((x): x is RefreshedAccount => x !== null);

  if (userIds.length !== accounts.length) {
    const ids = new Map(accounts.map((acc) => [acc.userId, acc]));
    userIds = userIds.filter((id) => {
      if (!ids.has(id)) {
        console.error(`Snapshot(${id}): failed to refresh tokens, aborting for user`);
        return false;
      }
      return true;
    });
  }

  return accounts;
}

async function fetchSnapshotData(
  accounts: RefreshedAccount[],
  nItems: number,
): Promise<SnapshotData> {
  let ret: SnapshotData = {
    tracks: [],
    trackArtists: [],
    trackGenres: [],
    trackFeatures: [],

    artists: [],
    artistGenres: [],

    albums: [],
    albumArtists: [],

    trackRankings: [],
    artistRankings: [],
  };

  const timestamp = new Date().toDateString();

  const trackIds = new Set<string>();
  const trackArtists = new Map<string, Set<string>>();

  const artistIds = new Set<string>();

  const albums = new Map<string, schema.InsertAlbum>();
  const albumArtists = new Map<string, Set<string>>();

  // Fetch and process top items data for each account
  // NOTE: We do not process everything here to avoid duplicates and to fetch more data later.
  for (const account of accounts) {
    const topTracksPromise = spotify.fetchTopTracks(account.accessToken, nItems);
    const topArtistsPromise = spotify.fetchTopArtists(account.accessToken, nItems);

    const topTracksData = await topTracksPromise;
    for (const [idx, track] of topTracksData.entries()) {
      if (!track.id) continue;

      if (!trackIds.has(track.id)) {
        trackIds.add(track.id);
        ret.tracks.push({
          trackId: track.id,
          trackName: track.name || "",
          explicit: track.explicit || false,
          popularity: track.popularity || 0,
          albumId: track.album?.id || null,
        });
      }

      for (const artist of track.artists || []) {
        if (!artist.id) continue;
        artistIds.add(artist.id);
        if (!trackArtists.has(track.id)) trackArtists.set(track.id, new Set());
        trackArtists.get(track.id)?.add(artist.id);
      }

      if (track.album) {
        albums.set(track.album.id, {
          albumId: track.album.id,
          name: track.album.name,
          type: track.album.album_type,
          totalTracks: track.album.total_tracks,
          releaseYear: parseInt(track.album.release_date.split("-")[0] || ""),
          imageURL: track.album.images?.[0]?.url || null,
        });

        for (const artist of track.album.artists) {
          if (!artist.id) continue;
          artistIds.add(artist.id);
          if (!albumArtists.has(track.album.id)) albumArtists.set(track.album.id, new Set());
          albumArtists.get(track.album.id)?.add(artist.id);
        }
      }

      ret.trackRankings.push({
        trackId: track.id,
        userId: account.userId,
        ranking: idx,
        timestamp,
      });
    }

    const topArtistsData = await topArtistsPromise;
    for (const [idx, artist] of topArtistsData.entries()) {
      if (!artist.id) continue;

      artistIds.add(artist.id);
      ret.artistRankings.push({
        artistId: artist.id,
        userId: account.userId,
        ranking: idx,
        timestamp,
      });
    }
  }

  // Launch fetches for more data, collect the promises later.
  const featuresPromise = spotify.fetchTracksFeatures(
    accounts[0]?.accessToken || "",
    Array.from(trackIds),
  );
  const artistsPromise = spotify.fetchArtistsData(
    accounts[0]?.accessToken || "",
    Array.from(artistIds),
  );

  // Process data we have first...
  for (const [trackId, artistsIds] of trackArtists) {
    for (const artistId of artistsIds) {
      ret.trackArtists.push({ trackId, artistId });
    }
  }

  for (const album of albums.values()) {
    ret.albums.push(album);
  }

  for (const [albumId, artistIds] of albumArtists) {
    for (const artistId of artistIds) {
      ret.albumArtists.push({ albumId, artistId });
    }
  }

  // ...Then collect the promises and process remaining data.
  const features = await featuresPromise;
  if (features.length !== trackIds.size) throw new Error("Mismatch in number of fetched tracks");
  for (const feat of features) {
    if (!feat.track_id) continue;
    ret.trackFeatures.push({
      trackId: feat.track_id,
      duration: feat.duration_ms,
      acousticness: feat.acousticness,
      danceability: feat.danceability,
      instrumentalness: feat.instrumentalness,
      liveness: feat.liveness,
      loudness: feat.loudness,
      speechiness: feat.speechiness,
      energy: feat.energy,
      valence: feat.valence,
      key: feat.key,
      mode: feat.mode,
      tempo: feat.tempo,
      timeSignature: feat.time_signature,
    });
  }

  const trackGenres = new Map<string, string[]>();

  const artists = await artistsPromise;
  if (artists.length !== artistIds.size) throw new Error("Mismatch in number of fetched artists");
  for (const artist of artists) {
    if (!artist.id) continue;
    ret.artists.push({
      artistId: artist.id,
      name: artist.name || "",
      popularity: artist.popularity || 0,
      followers: artist.followers?.total || 0,
      imageURL: artist.images?.[0]?.url || null,
    });
    trackGenres.set(artist.id, artist.genres || []);
    for (const genre of artist.genres || []) {
      ret.artistGenres.push({ artistId: artist.id, genre });
    }
  }

  // NOTE: Genres for a track are the genres o, its artists.
  //       If Spotify changes its API to include genre data for tracks, we should update this.
  for (const [trackId, artistIds] of trackArtists) {
    for (const artist of artistIds) {
      for (const genre of trackGenres.get(artist) || []) {
        ret.trackGenres.push({ trackId, genre });
      }
    }
  }

  return ret;
}

async function saveSnapshot(
  db: VercelPgDatabase<typeof schema>,
  data: SnapshotData,
): Promise<void> {
  await db.transaction(async (tr) => {
    try {
      await saveBaseData(tr, data);
    } catch (e) {
      console.error("Snapshot: failed to save base data to database, rolling back...");
      console.error(e);
      tr.rollback();
      throw e;
    }
  });

  await db.transaction(async (tr) => {
    try {
      await saveRankingsData(tr, data);
    } catch (e) {
      console.error("Snapshot: failed to save rankings data to database, rolling back...");
      console.error(e);
      tr.rollback();
      throw e;
    }
  });
}

async function saveBaseData(db: VercelPgDatabase<typeof schema>, data: SnapshotData) {
  if (data.albums.length > 0) {
    const albumCols = Object.keys(data.albums[0] || {})
      .filter((k) => k != "albumId")
      .reduce((acc, k) => acc.set(k, sql.raw(`excluded."${k}"`)), new Map<string, any>());
    await db
      .insert(schema.albums)
      .values(data.albums)
      .onConflictDoUpdate({
        target: schema.albums.albumId,
        set: Object.fromEntries(albumCols),
      });
  }

  if (data.artists.length > 0) {
    const artistCols = Object.keys(data.artists[0] || {})
      .filter((k) => k != "artistId")
      .reduce((acc, k) => acc.set(k, sql.raw(`excluded."${k}"`)), new Map<string, any>());
    await db
      .insert(schema.artists)
      .values(data.artists)
      .onConflictDoUpdate({
        target: schema.artists.artistId,
        set: Object.fromEntries(artistCols),
      });
  }

  if (data.tracks.length > 0) {
    const trackCols = Object.keys(data.tracks[0] || {})
      .filter((k) => k != "trackId")
      .reduce((acc, k) => acc.set(k, sql.raw(`excluded."${k}"`)), new Map<string, any>());
    await db
      .insert(schema.tracks)
      .values(data.tracks)
      .onConflictDoUpdate({
        target: schema.tracks.trackId,
        set: Object.fromEntries(trackCols),
      });

    const featCols = Object.keys(data.trackFeatures[0] || {})
      .filter((k) => k != "trackId")
      .reduce((acc, k) => acc.set(k, sql.raw(`excluded."${k}"`)), new Map<string, any>());
    await db
      .insert(schema.tracksFeatures)
      .values(data.trackFeatures)
      .onConflictDoUpdate({
        target: schema.tracksFeatures.trackId,
        set: Object.fromEntries(featCols),
      });
  }

  await db.insert(schema.trackArtists).values(data.trackArtists).onConflictDoNothing();
  await db.insert(schema.trackGenres).values(data.trackGenres).onConflictDoNothing();
  await db.insert(schema.artistGenres).values(data.artistGenres).onConflictDoNothing();
  await db.insert(schema.albumArtists).values(data.albumArtists).onConflictDoNothing();
}

async function saveRankingsData(db: VercelPgDatabase<typeof schema>, data: SnapshotData) {
  await db.insert(schema.trackRankings).values(data.trackRankings).onConflictDoNothing();
  await db.insert(schema.artistRankings).values(data.artistRankings).onConflictDoNothing();
}
