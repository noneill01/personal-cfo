import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { buildIdentity, assertFreshBuild } from "../scripts/build-identity.mjs";

test("publish freshness rejects changed HEAD and uncommitted code even if the build directory exists", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "finance-build-test-"));
  try {
    const git = (...args) => execFileSync("git", args, { cwd: dir, stdio: "pipe" });
    git("init"); git("config", "user.name", "Build test"); git("config", "user.email", "test@example.invalid");
    mkdirSync(path.join(dir, "app"));
    writeFileSync(path.join(dir, "app/page.tsx"), "export default 1;");
    git("add", "."); git("commit", "-m", "Fixture");
    const metadata = buildIdentity(dir);
    assert.doesNotThrow(() => assertFreshBuild(dir, metadata));
    assert.throws(() => assertFreshBuild(dir, {}), /Build is stale/);
    git("commit", "--allow-empty", "-m", "New revision");
    assert.throws(() => assertFreshBuild(dir, metadata), /Build is stale/);
    const newBuild = buildIdentity(dir);
    writeFileSync(path.join(dir, "app/page.tsx"), "export default 2;");
    assert.throws(() => assertFreshBuild(dir, newBuild), /Build is stale/);
    const dirtyBuild = buildIdentity(dir);
    assert.doesNotThrow(() => assertFreshBuild(dir, dirtyBuild));
    writeFileSync(path.join(dir, "app/new.ts"), "export const newCode = 1;");
    assert.throws(() => assertFreshBuild(dir, dirtyBuild), /Build is stale/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
