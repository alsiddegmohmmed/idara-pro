/**
 * Fastify `trustProxy` from the TRUST_PROXY env var: a comma-separated list of proxy
 * addresses/CIDRs (or proxy-addr names such as "loopback"), empty = trust nobody.
 * Only trusted hops may set X-Forwarded-For; otherwise anyone could spoof their IP and
 * dodge per-IP limits, while behind Caddy every user would share Caddy's address.
 */
export function parseTrustProxy(value: string | undefined): false | string[] {
  const hops = (value ?? "")
    .split(",")
    .map((hop) => hop.trim())
    .filter((hop) => hop !== "");
  return hops.length > 0 ? hops : false;
}
