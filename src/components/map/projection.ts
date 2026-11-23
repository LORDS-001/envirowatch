import type { Site } from "@/lib/api/types";

interface Projection {
  bounds: [number, number, number, number];
  toXY: (latitude: number, longitude: number) => [number, number];
}

export function project(
  sites: readonly Site[],
  width: number,
  height: number,
  padding = 28,
): Projection | null {
  if (!sites.length || width <= 0 || height <= 0) return null;
  const latitudes = sites.map((site) => site.latitude);
  const longitudes = sites.map((site) => site.longitude);
  const centerLatitude = (Math.min(...latitudes) + Math.max(...latitudes)) / 2;
  const centerLongitude = (Math.min(...longitudes) + Math.max(...longitudes)) / 2;
  const cosine = Math.max(0.000001, Math.cos((centerLatitude * Math.PI) / 180));
  const inset = Math.min(padding, width / 4, height / 4);
  const innerWidth = width - 2 * inset;
  const innerHeight = height - 2 * inset;
  let latitudeSpan = Math.max(0.02, Math.max(...latitudes) - Math.min(...latitudes));
  let longitudeSpan = Math.max(0.02 / cosine, Math.max(...longitudes) - Math.min(...longitudes));
  if ((longitudeSpan * cosine) / latitudeSpan > innerWidth / innerHeight)
    latitudeSpan = (longitudeSpan * cosine * innerHeight) / innerWidth;
  else longitudeSpan = (latitudeSpan * innerWidth) / innerHeight / cosine;
  latitudeSpan *= height / innerHeight;
  longitudeSpan *= width / innerWidth;
  const south = centerLatitude - latitudeSpan / 2;
  const north = centerLatitude + latitudeSpan / 2;
  const west = centerLongitude - longitudeSpan / 2;
  const east = centerLongitude + longitudeSpan / 2;
  return {
    bounds: [south, west, north, east],
    toXY: (latitude, longitude) => [
      ((longitude - west) / longitudeSpan) * width,
      ((north - latitude) / latitudeSpan) * height,
    ],
  };
}
