import { z } from "zod";

import {
  TrackObject,
  trackObjSchema,
  ArtistObject,
  artistObjSchema,
  AudioFeatures,
  audioFeatSchema,
} from "./extern_types";

// Maximum number of items allowed per request
const MAX_REQUEST_ITEMS = 50;

export async function fetchTopTracks(
  accessToken: string,
  nitems: number,
): Promise<TrackObject[]> {
  var track_data: TrackObject[] = [];
  try {
    for (
      var start = 0, len = Math.min(MAX_REQUEST_ITEMS, nitems);
      start < nitems;
      start += len, len = Math.min(nitems - start, MAX_REQUEST_ITEMS)
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
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
        },
      );

      const json = await response.json();
      if (!response.ok) throw json;

      const response_array = z.array(trackObjSchema).parse(json.items);
      track_data = track_data.concat(response_array);
    }
    return track_data;
  } catch (error) {
    console.error("Error requesting most played songs:", error);
    console.error(`Got ${track_data.length} tracks out of ${nitems} requested`);
    return track_data;
  }
}

export async function fetchArtistsData(
  accessToken: string,
  artistid_list: string[],
): Promise<ArtistObject[]> {
  var batches: string[] = [];
  artistid_list.forEach((id, idx) => {
    if (idx % 50 == 0) {
      batches.push(`${id}`);
    } else {
      batches[batches.length - 1] += `,${id}`;
    }
  });

  var artist_data: ArtistObject[] = [];
  try {
    for (const batch of batches) {
      const response = await fetch(
        "https://api.spotify.com/v1/artists?" +
          new URLSearchParams({
            ids: batch,
          }),
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
        },
      );

      const json = await response.json();
      if (!response.ok) throw json;

      const response_array = z.array(artistObjSchema).parse(json.artists);
      artist_data = artist_data.concat(response_array);
    }
    return artist_data;
  } catch (error) {
    console.error("Error requesting artists data", error);
    return artist_data;
  }
}

export async function fetchTracksFeatures(
  accessToken: string,
  trackid_list: string[],
): Promise<AudioFeatures[]> {
  var batches: string[] = [];
  trackid_list.forEach((id, idx) => {
    if (idx % 50 == 0) {
      batches.push(`${id}`);
    } else {
      batches[batches.length - 1] += `,${id}`;
    }
  });

  var audio_features: AudioFeatures[] = [];
  try {
    for (const batch of batches) {
      const response = await fetch(
        "https://api.spotify.com/v1/audio-features?" +
          new URLSearchParams({
            ids: batch,
          }),
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
        },
      );

      const json = await response.json();
      if (!response.ok) throw json;

      const response_array = z.array(audioFeatSchema).parse(json.artists);
      audio_features = audio_features.concat(response_array);
    }
    return audio_features;
  } catch (error) {
    console.error("Error requesting artists data", error);
    return audio_features;
  }
}
