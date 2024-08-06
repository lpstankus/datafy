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

async function fetchTopItems(
  token: string,
  itemType: "artists" | "tracks",
  nitems: number,
): Promise<any> {
  var data: any[] = [];

  let schema = itemType == "artists" ? artistObjSchema : trackObjSchema;

  try {
    let len = Math.min(MAX_REQUEST_ITEMS, nitems);
    for (var idx = 0; idx < nitems; idx += len) {
      const params = { time_range: "short_term", limit: `${len}`, offset: `${idx}` };
      const response = await fetch(
        `https://api.spotify.com/v1/me/top/${itemType}?${new URLSearchParams(params)}`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
        },
      );

      const json = await response.json();
      if (!response.ok) throw json;

      const response_array = z.array(schema).parse(json.items);
      data = data.concat(response_array);

      len = Math.min(nitems - idx, MAX_REQUEST_ITEMS);
    }
    return data;
  } catch (error) {
    console.error(`Error requesting most played ${itemType}:`, error);
    console.error(`Got ${data.length} ${itemType} out of ${nitems} requested`);
    return data;
  }
}

export async function fetchTopTracks(token: string, nitems: number): Promise<TrackObject[]> {
  return await fetchTopItems(token, "tracks", nitems);
}

export async function fetchTopArtists(token: string, nitems: number): Promise<ArtistObject[]> {
  return fetchTopItems(token, "artists", nitems);
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
        "https://api.spotify.com/v1/artists?" + new URLSearchParams({ ids: batch }),
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
        "https://api.spotify.com/v1/audio-features?" + new URLSearchParams({ ids: batch }),
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
