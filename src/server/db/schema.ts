import { relations, sql } from "drizzle-orm";
import {
  index,
  integer,
  boolean,
  pgTableCreator,
  primaryKey,
  unique,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";
import { type AdapterAccount } from "next-auth/adapters";

/**
 * This is an example of how to use the multi-project schema feature of Drizzle ORM. Use the same
 * database instance for multiple projects.
 *
 * @see https://orm.drizzle.team/docs/goodies#multi-project-schema
 */
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
}));

export const trackArtists = createTable("trackArtists", {
  artistId: varchar("artistId", { length: 255 })
    .notNull()
    .references(() => artists.artistId),
  trackId: varchar("trackId", { length: 255 })
    .notNull()
    .references(() => tracks.trackId),
});
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

export const tracksRelations = relations(tracks, ({ many }) => ({
  artists: many(trackArtists),
  genres: many(trackGenres),
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
