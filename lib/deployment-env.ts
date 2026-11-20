/**
 * Which deployment this process is: "production", "preview", or undefined for
 * someone's own machine.
 *
 * VERCEL_ENV on Vercel; DEPLOYMENT_ENV on the self-hosted server (deploy/),
 * which has no Vercel variables at all. Without the second, every real visit
 * on the server would be filed as internal traffic (app/api/analytics/events)
 * and the email panel would read 本机开发环境 in production.
 */
export function deploymentEnv(): string | undefined {
  return process.env.VERCEL_ENV?.trim() || process.env.DEPLOYMENT_ENV?.trim() || undefined;
}
