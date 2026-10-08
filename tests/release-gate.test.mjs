import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { prohibitedArchivePaths, sensitiveContentFindings, staticPrivacyFindings } from "../scripts/release-gate.mjs";

test("release archive rejects local state, private imports, financial files and build output", () => {
  const files = [
    "README.md", "app/page.tsx", ".git/config", "node_modules/pkg/index.js",
    "dist/client/index.js", "imports/account.csv", "backups/private.json",
    ".DS_Store", "statement.pdf", "assets/app.js.map", ".local-service/output.log",
  ];
  assert.deepEqual(prohibitedArchivePaths(files), files.slice(2));
});

test("content scanner reports only categories and paths", () => {
  const content = "Authorization: Bearer " + "x".repeat(24) + "\nGB12ABCD12345678901234";
  const findings = sensitiveContentFindings("fixture.txt", content);
  assert.deepEqual(findings.map(item => item.kind).sort(), ["UK account identifier", "embedded bearer credential"]);
  assert.equal(JSON.stringify(findings).includes("GB12"), false);
  assert.equal(JSON.stringify(findings).includes("xxxx"), false);
});

test("static-output guard rejects private-capable assets, source maps and sensitive bundles", () => {
  const root = mkdtempSync(path.join(tmpdir(), "personal-cfo-static-"));
  try {
    mkdirSync(path.join(root, "data"));
    writeFileSync(path.join(root, "index.js"), "export const safe = true;");
    writeFileSync(path.join(root, "data", "statement.json"), "{}");
    writeFileSync(path.join(root, "app.js.map"), "{}");
    writeFileSync(path.join(root, "unsafe.js"), "const token='github_pat_" + "a".repeat(30) + "';");
    const findings = staticPrivacyFindings(root);
    assert.ok(findings.some(item => item.file.endsWith("data/statement.json") && item.kind === "private-capable static asset"));
    assert.ok(findings.some(item => item.file.endsWith("app.js.map") && item.kind === "private-capable static asset"));
    assert.ok(findings.some(item => item.file.endsWith("unsafe.js") && item.kind === "credential token"));
  } finally { rmSync(root, { recursive: true, force: true }); }
});
