import { z } from "zod";

export const imageObjSchema = z.object({
  url: z.string(),
  height: z.number().nullable(),
  width: z.number().nullable(),
});

export const artistObjSchema = z.object({
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
  images: z.array(imageObjSchema).optional(),
  name: z.string().optional(),
  popularity: z.number().optional(),
  type: z.string().optional(),
  uri: z.string().optional(),
});

export type ArtistObject = z.infer<typeof artistObjSchema>;

export const trackObjSchema = z.object({
  album: z
    .object({
      album_type: z.string(),
      total_tracks: z.number(),
      available_markets: z.array(z.string()),
      external_urls: z.object({ spotify: z.string().optional() }),
      href: z.string(),
      id: z.string(),
      images: z.array(imageObjSchema),
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
  artists: z.array(artistObjSchema).optional(),
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

export type TrackObject = z.infer<typeof trackObjSchema>;

export const audioFeatSchema = z.object({
  type: z.literal("audio_features").optional(),
  track_id: z.string().optional(),
  duration_ms: z.number().optional(),

  acousticness: z.number().optional(),
  danceability: z.number().optional(),
  instrumentalness: z.number().optional(),
  liveness: z.number().optional(),
  loudness: z.number().optional(),
  speechiness: z.number().optional(),
  energy: z.number().optional(),
  valence: z.number().optional(),

  key: z.number().optional(),
  mode: z.number().optional(),
  tempo: z.number().optional(),
  time_signature: z.number().optional(),

  analysis_url: z.string().optional(),
  uri: z.string().optional(),
});

export type AudioFeatures = z.infer<typeof audioFeatSchema>;
