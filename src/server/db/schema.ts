import { relations, sql } from "drizzle-orm";

import {
  boolean,
  date,
  index,
  integer,
  real,
  pgTableCreator,
  primaryKey,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";
import { type AdapterAccount } from "next-auth/adapters";

export const createTable = pgTableCreator((name) => `datafy_${name}`);

export const users = createTable("user", {
  id: varchar("id", { length: 255 }).notNull().primaryKey(),
  name: varchar("name", { length: 255 }),
  email: varchar("email", { length: 255 }).notNull(),
  emailVerified: timestamp("emailVerified", {
    mode: "date",
    withTimezone: true,
  }).default(sql`CURRENT_TIMESTAMP`),
  image: varchar("image", { length: 255 }),
});

export const usersRelations = relations(users, ({ many }) => ({
  accounts: many(accounts),
}));

export const accounts = createTable(
  "account",
  {
    userId: varchar("userId", { length: 255 })
      .notNull()
      .references(() => users.id),
    type: varchar("type", { length: 255 }).$type<AdapterAccount["type"]>().notNull(),
    provider: varchar("provider", { length: 255 }).notNull(),
    providerAccountId: varchar("providerAccountId", { length: 255 }).notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: varchar("token_type", { length: 255 }),
    scope: varchar("scope", { length: 255 }),
    id_token: text("id_token"),
    session_state: varchar("session_state", { length: 255 }),
  },
  (account) => ({
    compoundKey: primaryKey({
      columns: [account.provider, account.providerAccountId],
    }),
    userIdIdx: index("account_userId_idx").on(account.userId),
  }),
);
export type Account = typeof accounts.$inferSelect;

export const accountsRelations = relations(accounts, ({ one }) => ({
  user: one(users, { fields: [accounts.userId], references: [users.id] }),
}));

export const sessions = createTable(
  "session",
  {
    sessionToken: varchar("sessionToken", { length: 255 }).notNull().primaryKey(),
    userId: varchar("userId", { length: 255 })
      .notNull()
      .references(() => users.id),
    expires: timestamp("expires", {
      mode: "date",
      withTimezone: true,
    }).notNull(),
  },
  (session) => ({
    userIdIdx: index("session_userId_idx").on(session.userId),
  }),
);

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, { fields: [sessions.userId], references: [users.id] }),
}));

export const verificationTokens = createTable(
  "verificationToken",
  {
    identifier: varchar("identifier", { length: 255 }).notNull(),
    token: varchar("token", { length: 255 }).notNull(),
    expires: timestamp("expires", {
      mode: "date",
      withTimezone: true,
    }).notNull(),
  },
  (vt) => ({
    compoundKey: primaryKey({ columns: [vt.identifier, vt.token] }),
  }),
);

export const artists = createTable("artist", {
  artistId: varchar("artistId", { length: 255 }).notNull().primaryKey(), // same as in spotify
  name: varchar("name", { length: 255 }).notNull(),
  popularity: integer("popularity"),
  followers: integer("followers"),
});
export type InsertArtist = typeof artists.$inferInsert;

export const artistsRelations = relations(artists, ({ many }) => ({
  tracks: many(trackArtists),
  genres: many(artistGenres),
  artistLists: many(artistLists),
}));

export const trackArtists = createTable(
  "trackArtists",
  {
    artistId: varchar("artistId", { length: 255 })
      .notNull()
      .references(() => artists.artistId),
    trackId: varchar("trackId", { length: 255 })
      .notNull()
      .references(() => tracks.trackId),
  },
  (trackArtist) => ({
    compoundKey: primaryKey({
      columns: [trackArtist.artistId, trackArtist.trackId],
    }),
  }),
);
export type InsertTrackArtist = typeof trackArtists.$inferInsert;

export const artistTracksRelations = relations(trackArtists, ({ one }) => ({
  artist: one(artists, { fields: [trackArtists.artistId], references: [artists.artistId] }),
  track: one(tracks, { fields: [trackArtists.trackId], references: [tracks.trackId] }),
}));

export const artistGenres = createTable(
  "artistGenre",
  {
    artistId: varchar("artistId", { length: 255 })
      .notNull()
      .references(() => artists.artistId),
    genre: varchar("genreId", { length: 255 }).notNull(),
  },
  (artistGenres) => ({
    compoundKey: primaryKey({
      columns: [artistGenres.artistId, artistGenres.genre],
    }),
  }),
);
export type InsertArtistGenre = typeof artistGenres.$inferInsert;

export const artistGenresRelations = relations(artistGenres, ({ one }) => ({
  artist: one(artists, { fields: [artistGenres.artistId], references: [artists.artistId] }),
}));

export const tracks = createTable("track", {
  trackId: varchar("trackId", { length: 255 }).notNull().primaryKey(), // same as in spotify
  trackName: varchar("trackName", { length: 255 }).notNull(),
  albumName: varchar("albumName", { length: 255 }),
  releaseYear: integer("releaseYear").notNull(),
  explicit: boolean("explicit").notNull(),
  popularity: integer("popularity").notNull(),
});
export type InsertTrack = typeof tracks.$inferInsert;

export const tracksRelations = relations(tracks, ({ many, one }) => ({
  artists: many(trackArtists),
  genres: many(trackGenres),
  trackLists: many(trackLists),
  features: one(tracksFeatures, { fields: [tracks.trackId], references: [tracksFeatures.trackId] }),
}));

export const trackGenres = createTable(
  "trackGenre",
  {
    trackId: varchar("trackId", { length: 255 })
      .notNull()
      .references(() => tracks.trackId),
    genre: varchar("genre", { length: 255 }).notNull(),
  },
  (trackGenres) => ({
    compoundKey: primaryKey({
      columns: [trackGenres.trackId, trackGenres.genre],
    }),
  }),
);
export type InsertTrackGenre = typeof trackGenres.$inferInsert;

export const trackGenresRelations = relations(trackGenres, ({ one }) => ({
  track: one(tracks, { fields: [trackGenres.trackId], references: [tracks.trackId] }),
}));

export const tracksFeatures = createTable("trackFeatures", {
  trackId: varchar("trackId", { length: 255 })
    .notNull()
    .primaryKey()
    .references(() => tracks.trackId),
  duration: integer("duration"),
  acousticness: real("acousticness"),
  danceability: real("danceability"),
  instrumentalness: real("instrumentalness"),
  liveness: real("liveness"),
  loudness: real("loudness"),
  speechiness: real("speechiness"),
  energy: real("energy"),
  valence: real("valence"),
  key: integer("key"),
  mode: integer("mode"),
  tempo: real("tempo"),
  timeSignature: integer("timeSignature"),
});
export type InsertTrackFeatures = typeof tracksFeatures.$inferInsert;

export const trackFeaturesRelations = relations(tracksFeatures, ({ one }) => ({
  track: one(tracks, { fields: [tracksFeatures.trackId], references: [tracks.trackId] }),
}));

export const trackLists = createTable(
  "trackList",
  {
    userId: varchar("userId", { length: 255 })
      .notNull()
      .references(() => users.id),
    trackId: varchar("trackId", { length: 255 })
      .notNull()
      .references(() => tracks.trackId),
    generation: integer("generation").notNull(),
    ranking: integer("ranking").notNull(),
    timestamp: date("timestamp").notNull(),
  },
  (trackList) => ({
    compoundKey: primaryKey({
      columns: [trackList.userId, trackList.generation, trackList.ranking],
    }),
  }),
);
export type InsertTrackList = typeof trackLists.$inferInsert;

export const trackListRelations = relations(trackLists, ({ one }) => ({
  user: one(users, { fields: [trackLists.userId], references: [users.id] }),
  track: one(tracks, { fields: [trackLists.trackId], references: [tracks.trackId] }),
}));

export const artistLists = createTable(
  "artistList",
  {
    userId: varchar("userId", { length: 255 })
      .notNull()
      .references(() => users.id),
    artistId: varchar("artistId", { length: 255 })
      .notNull()
      .references(() => artists.artistId),
    generation: integer("generation").notNull(),
    ranking: integer("ranking").notNull(),
    timestamp: date("timestamp").notNull(),
  },
  (artistList) => ({
    compoundKey: primaryKey({
      columns: [artistList.userId, artistList.generation, artistList.ranking],
    }),
  }),
);
export type InsertArtistList = typeof artistLists.$inferInsert;

export const artistListRelations = relations(artistLists, ({ one }) => ({
  user: one(users, { fields: [artistLists.userId], references: [users.id] }),
  artist: one(artists, { fields: [artistLists.artistId], references: [artists.artistId] }),
}));
