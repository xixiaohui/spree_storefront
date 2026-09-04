/**
 * Media URL origin normalization.
 *
 * A Spree/Rails backend that is tunneled or otherwise exposed through a
 * different public host may still embed its *internal* origin (e.g.
 * `http://localhost:3001`) in the Active Storage URLs it returns for product
 * media, categories, option values, etc. Those URLs are unreachable from
 * browsers, so this module rewrites the origin of any private/loopback URL in
 * API responses to the public API origin the client is configured with.
 *
 * The rewrite is intentionally conservative:
 * - Only absolute `http(s)` URLs whose host is loopback or a private range are
 *   touched. Public/CDN hosts are never rewritten.
 * - When the target origin is itself private (local dev, unit tests), the
 *   rewrite is disabled entirely and the original fetch passes through, so
 *   tests and local-only setups keep exact behavior.
 */

const PRIVATE_ORIGIN_RE =
  /https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})(?::\d+)?/gi;

function isPrivateHost(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname === "::1" ||
    hostname === "127.0.0.1" ||
    hostname === "0.0.0.0" ||
    hostname.startsWith("10.") ||
    hostname.startsWith("192.168.") ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(hostname)
  );
}

function parseOrigin(baseUrl: string): string | undefined {
  try {
    return new URL(baseUrl).origin;
  } catch {
    return undefined;
  }
}

/**
 * Rewrite private/loopback origins in a JSON payload to `targetOrigin`.
 * Pure string replacement — safe for JSON bodies of any shape.
 */
export function rewritePrivateOrigins(
  jsonText: string,
  targetOrigin: string,
): string {
  return jsonText.replace(PRIVATE_ORIGIN_RE, targetOrigin);
}

/**
 * Build a fetch wrapper for the Spree SDK client that rewrites private-host
 * asset URLs in JSON responses to a public origin.
 *
 * @param baseUrl - API base URL the client is configured with. The rewrite
 *   target is `SPREE_IMAGES_URL` when set (CDN/hosted images take precedence),
 *   otherwise the origin of `baseUrl`.
 * @returns a fetch-compatible function, or the original global fetch when the
 *   target origin is private/unavailable (no rewrite needed).
 */
type FetchArgs = Parameters<typeof fetch>;

export function createMediaOriginFetch(baseUrl: string): typeof fetch {
  const configuredImagesUrl = process.env.SPREE_IMAGES_URL?.trim();
  const targetOrigin = parseOrigin(configuredImagesUrl || baseUrl);

  const passthrough: typeof fetch = (
    input: FetchArgs[0],
    init?: FetchArgs[1],
  ) => fetch(input, init);

  if (!targetOrigin) {
    return passthrough;
  }
  try {
    if (isPrivateHost(new URL(targetOrigin).hostname)) {
      // Local/dev/test target — nothing to map private URLs onto.
      return passthrough;
    }
  } catch {
    return passthrough;
  }

  return async (input, init) => {
    const response = await fetch(input, init);
    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("json")) {
      return response;
    }
    try {
      const text = await response.clone().text();
      if (!text.trim()) {
        return response;
      }
      const rewritten = rewritePrivateOrigins(text, targetOrigin);
      if (rewritten === text) {
        return response;
      }
      const headers = new Headers(response.headers);
      return new Response(rewritten, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    } catch {
      return response;
    }
  };
}
