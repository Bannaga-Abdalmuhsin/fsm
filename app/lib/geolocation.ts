import type { Geo } from "@shared/pmr";

export function currentFix(): Promise<Geo> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("This device has no GPS."));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) =>
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: Math.max(position.coords.accuracy, 0.1),
          timestamp: new Date(position.timestamp).toISOString(),
        }),
      () =>
        reject(
          new Error("Location permission is required. Enable GPS and retry."),
        ),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  });
}
