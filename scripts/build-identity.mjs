import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

// Hash only application/build inputs known to Git (including new unignored files).
// Private financial files are ignored and must never enter version metadata.
export function buildIdentity(project) {
  const git = args => execFileSync("git", args, { cwd: project, encoding: "utf8" }).trim();
  const revision = git(["rev-parse", "HEAD"]);
  const paths = git(["ls-files", "-z", "--cached", "--others", "--exclude-standard", "--",
    "app", "components", "lib", "scripts", "public", "package.json", "pnpm-lock.yaml", "tsconfig.json",
    "vite.config.*", "next.config.*", "postcss.config.*", "install-background.command"])
    .split("\0").filter(file => file && file !== "public/app-version.json").sort();
  const digest = createHash("sha256");
  for (const file of [...new Set(paths)]) {
    digest.update(file + "\0");
    digest.update(existsSync(path.join(project, file)) ? readFileSync(path.join(project, file)) : "<deleted>");
    digest.update("\0");
  }
  return { revision, sourceDigest: digest.digest("hex") };
}

export function assertFreshBuild(project, metadata) {
  const current = buildIdentity(project);
  if (metadata.revision !== current.revision || metadata.sourceDigest !== current.sourceDigest)
    throw Error("Build is stale. Run the production build before publishing.");
  return current;
}
