/**
 * Why a REDIS_URL is unusable, or null if it is fine. The message never contains the value:
 * the URL usually carries the Redis password and startup errors end up in logs.
 * Expected shape: redis://[:password@]host[:port][/db]  (rediss:// for TLS).
 */
export function redisUrlProblem(value: string): string | null {
  // ioredis matches /^rediss?:\/\// on the raw string and builds a URL from it; a stray space makes it
  // throw an error object that contains the whole URL (and the password), so reject that here.
  if (/\s/.test(value)) {
    return "it contains whitespace (check for a stray space or line break around the value)";
  }
  if (!/^rediss?:\/\//i.test(value)) {
    return "it must start with redis:// or rediss://";
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return "it cannot be parsed — check the host and port, and percent-encode special characters (@ : / # ? %) in the password, or use letters and digits only";
  }
  if ((value.match(/@/g) ?? []).length > 1) {
    return "the password contains an unencoded '@' — percent-encode it (%40) or use letters and digits only";
  }
  if (url.hash !== "") {
    return "it contains a '#' — percent-encode it in the password (%23), or use letters and digits only";
  }
  try {
    // ioredis decodes these itself and throws "URI malformed" (late, at connect time) on a bare '%'.
    decodeURIComponent(url.username);
    decodeURIComponent(url.password);
  } catch {
    return "the password contains a '%' that isn't part of a percent-encoding — write it as %25";
  }
  if (!/^(\/\d*)?$/.test(url.pathname)) {
    return "the path must be empty or a database number, e.g. /0";
  }
  return null;
}
