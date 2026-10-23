/**
 * Tofu (new file): a copy made from Tofu's app gallery starts with no BETTER_AUTH_SECRET, and Better Auth signs nobody
 * in without one. When it is unset, this derives a stable one from the managed database's connection string, which
 * only this app's hosting and its owner hold, so sign-in works from the first deploy. A BETTER_AUTH_SECRET saved in
 * the app's settings replaces it. Changing from one to the other signs everybody out once, and Trello connections
 * saved before the change have to be made again (their tokens are encrypted with this secret).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const databaseUrl = process.env.DATABASE_URL;
  if (process.env.BETTER_AUTH_SECRET || !databaseUrl) return;

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(databaseUrl),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode("tofu-gallery/kan BETTER_AUTH_SECRET"),
  );
  process.env.BETTER_AUTH_SECRET = Array.from(new Uint8Array(mac), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}
