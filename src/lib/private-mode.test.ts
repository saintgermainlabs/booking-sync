import { describe, expect, it } from "vitest";
import { isPrivateMode, privateModeAction } from "./private-mode";

describe("isPrivateMode", () => {
  it("is on by default", () => {
    expect(isPrivateMode(undefined)).toBe(true);
    expect(isPrivateMode("")).toBe(true);
    expect(isPrivateMode("true")).toBe(true);
  });

  it("is off only for the exact string false", () => {
    expect(isPrivateMode("false")).toBe(false);
    expect(isPrivateMode("FALSE")).toBe(true);
    expect(isPrivateMode("0")).toBe(true);
  });
});

describe("privateModeAction", () => {
  it("sends the landing page to the dashboard", () => {
    expect(privateModeAction("/")).toBe("dashboard");
  });

  it.each([
    "/signup",
    "/onboard",
    "/blog",
    "/blog/how-to-sync",
    "/blog/rss.xml",
    "/changelog",
    "/llms.txt",
    "/sitemap.xml",
    "/api/auth/signup",
    "/api/auth/verify-email",
    "/api/auth/google",
    "/api/auth/google/callback",
    "/api/auth/google/one-tap",
    "/api/onboard",
    "/api/onboard/test-platform",
    "/api/blog-comments",
  ])("disables %s", (path) => {
    expect(privateModeAction(path)).toBe("not-found");
  });

  it.each([
    "/login",
    "/reset-password",
    "/dashboard",
    "/admin",
    "/invite/abc",
    "/g/token",
    "/api/auth/login",
    "/api/auth/forgot-password",
    "/api/calendar/feed/1/for-airbnb.ics",
    "/api/calendar/cron",
    "/api/health",
    "/robots.txt",
    "/blogroll",
    "/signups-report",
  ])("leaves %s alone", (path) => {
    expect(privateModeAction(path)).toBeNull();
  });
});
