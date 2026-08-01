/**
 * Centralized application configuration.
 *
 * Reads environment variables injected by Vite at build time and validates
 * that every required variable is present.  If any variable is missing the
 * app crashes immediately with a descriptive error (fail-fast pattern) so
 * that misconfigured deployments are caught at startup — not 30 seconds
 * later when a user clicks a button and a silent fetch fails.
 *
 * Vite resolves the correct .env file automatically:
 *   npm run dev   → .env.development
 *   npm run build → .env.production
 */

const config = {
  API_URL: import.meta.env.VITE_API_URL,
};

// ---------------------------------------------------------------------------
// Startup validation — fail fast if any required env var is missing
// ---------------------------------------------------------------------------
Object.entries(config).forEach(([key, value]) => {
  if (!value) {
    throw new Error(
      `Missing required environment variable: VITE_${key}. ` +
      `Create a .env.development file in the client/ directory (see .env.example).`
    );
  }
});

export default config;
