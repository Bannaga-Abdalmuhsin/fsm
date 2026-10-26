export async function getFix() {
  return {
    latitude: 0,
    longitude: 0,
    accuracy: 5,
    timestamp: new Date().toISOString(),
  };
}
export async function listDrafts() {
  return [];
}
export async function syncDrafts() {
  throw new Error(
    "Public demo: evidence sync is disabled. Use the live backend for real PMR photographs.",
  );
}
