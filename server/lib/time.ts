const riyadhFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Riyadh",
  dateStyle: "medium",
  timeStyle: "short",
});

export function formatRiyadh(value: string | Date) {
  return riyadhFormatter.format(typeof value === "string" ? new Date(value) : value);
}
