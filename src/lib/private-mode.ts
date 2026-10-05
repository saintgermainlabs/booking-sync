/**
 * Private (single-owner) mode.
 *
 * This deployment runs one property for one owner, not a public SaaS.
 * Private mode switches off everything that only makes sense on the
 * public renttools.io instance: self-service signup and onboarding,
 * Google sign-in (which creates accounts on first use), the marketing
 * landing page, the blog, the changelog, and the sitemap / llms.txt
 * crawl surfaces. Login, the dashboard, manager/cleaner invites, guest
 * forms, and the iCal feeds keep working.
 *
 * It is ON unless NEXT_PUBLIC_PRIVATE_MODE is exactly "false". The
 * NEXT_PUBLIC_ prefix makes Next.js inline the value at build time, so
 * middleware, server code, and client components all agree. Changing
 * it requires a rebuild.
 *
 * Kept free of Next.js imports so it can be unit-tested directly.
 */

export function isPrivateMode(
  value: string | undefined = process.env.NEXT_PUBLIC_PRIVATE_MODE,
): boolean {
  return value !== "false";
}

// Paths that do not exist in private mode. Matched per path segment:
// "/blog" covers "/blog" and "/blog/foo" but not "/blogroll".
const DISABLED_PATHS = [
  "/signup",
  "/onboard",
  "/blog",
  "/changelog",
  "/llms.txt",
  "/sitemap.xml",
  "/api/auth/signup",
  "/api/auth/verify-email", // only used to finish a signup
  "/api/auth/google", // find-or-create: would let anyone with a Google account in
  "/api/onboard",
  "/api/blog-comments",
];

function matchesPath(pathname: string, path: string): boolean {
  return pathname === path || pathname.startsWith(`${path}/`);
}

export type PrivateModeAction = "dashboard" | "not-found" | null;

/**
 * What private mode does with a request path (already stripped of any
 * locale prefix): send the bare landing page to the dashboard (the
 * auth gate then sends signed-out visitors to /login), 404 a disabled
 * surface, or leave it alone.
 */
export function privateModeAction(pathname: string): PrivateModeAction {
  if (pathname === "/") return "dashboard";
  if (DISABLED_PATHS.some((p) => matchesPath(pathname, p))) return "not-found";
  return null;
}
