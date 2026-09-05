/**
 * Shared guard deciding whether Sentry is genuinely configured.
 *
 * `next.config.ts`, `instrumentation.ts` and `instrumentation-client.ts` all
 * treat the DSN as the on/off switch. `.env.example` ships placeholder values
 * (`SENTRY_ORG=your-org`, `SENTRY_AUTH_TOKEN=your-auth-token`, a fake
 * `examplePublicKey@o0…` DSN); enabling Sentry with those makes
 * `@sentry/nextjs` attempt a release/source-map upload during `next build`
 * and abort it with "Project not found" (which fails Vercel deployments).
 *
 * Any non-empty, non-placeholder value is considered usable, so self-hosted
 * Sentry instances and custom regions keep working.
 */

const PLACEHOLDER_PATTERN = /your-|example/i;

export function isUsableSentryValue(value: string | undefined): boolean {
  const v = value?.trim();
  return typeof v === "string" && v.length > 0 && !PLACEHOLDER_PATTERN.test(v);
}

export function isUsableSentryDsn(dsn: string | undefined): boolean {
  const v = dsn?.trim();
  return (
    typeof v === "string" &&
    v.startsWith("https://") &&
    !PLACEHOLDER_PATTERN.test(v)
  );
}
