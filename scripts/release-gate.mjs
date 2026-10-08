import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const git = (args, options = {}) => execFileSync("git", args, { cwd: project, encoding: "utf8", ...options });
const privatePath = /(^|\/)(?:\.git|node_modules(?: \d+)?|dist|\.next|\.vinext|\.wrangler|\.local-service|imports|backups|exports|private-data|\.sites-runtime)(\/|$)|(^|\/)\.DS_Store$|\.(?:pdf|csv|xlsx?|zip|pem|key|log|map)$/i;
const personalPatterns = [
  ["UK account identifier", /\b\d{2}-\d{2}-\d{2}\b|\bGB\d{2}[A-Z]{4}\d{14}\b/i],
];
// The owner's known names, properties and distinctive amounts must be supplied
// privately at audit time, never committed to a public release guard.
const privateTerms = (process.env.PERSONAL_CFO_PRIVATE_TERMS ?? "").split("|").map(term => term.trim()).filter(Boolean);
const secretPatterns = [
  ["credential token", /\b(?:gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[0-9A-Z]{16})\b/],
  ["private key", /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ["embedded bearer credential", /\bAuthorization\s*[:=]\s*["']?Bearer\s+[A-Za-z0-9._~+/=-]{20,}/i],
  ["embedded connection credential", /\b(?:postgres(?:ql)?|mongodb(?:\+srv)?|mysql):\/\/[^\s:@]+:[^\s@]+@/i],
];

export function prohibitedArchivePaths(paths) {
  return paths.filter(name => privatePath.test(name.replace(/\\/g, "/")));
}

/** Reports categories and locations only; never prints matched private values. */
export function sensitiveContentFindings(file, content) {
  const findings = [];
  for (const [kind, pattern] of [...personalPatterns, ...secretPatterns]) {
    if (pattern.test(content)) findings.push({ file, kind });
  }
  if (privateTerms.some(term => content.toLocaleLowerCase().includes(term.toLocaleLowerCase()))) findings.push({ file, kind: "private audit term" });
  return findings;
}

export function trackedReleaseFiles() {
  return git(["ls-files", "-z"]).split("\0").filter(Boolean);
}

export function staticPrivacyFindings(root = path.join(project, "dist", "client")) {
  if (!existsSync(root)) return [{ file: "dist/client", kind: "production build missing" }];
  const findings = [];
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(absolute);
      else if (entry.isFile()) {
        const relative = path.relative(root, absolute).replace(/\\/g, "/");
        if (/\.(?:pdf|csv|xlsx?|map)$/i.test(relative) || /^data\/.*\.json$/i.test(relative)) findings.push({ file: `dist/client/${relative}`, kind: "private-capable static asset" });
        if (/\.(?:js|html|css|json|map)$/i.test(relative)) findings.push(...sensitiveContentFindings(`dist/client/${relative}`, readFileSync(absolute, "utf8")));
      }
    }
  };
  visit(root);
  return findings;
}

export function auditReleaseTree() {
  const files = trackedReleaseFiles();
  const findings = prohibitedArchivePaths(files).map(file => ({ file, kind: "prohibited archive path" }));
  for (const file of files) {
    if (!/\.(?:m?[jt]sx?|json|md|txt|py|swift|command|css|svg|yaml|yml|toml)$/i.test(file)) continue;
    findings.push(...sensitiveContentFindings(file, readFileSync(path.join(project, file), "utf8")));
  }
  findings.push(...staticPrivacyFindings());
  return [...new Map(findings.map(item => [`${item.file}:${item.kind}`, item])).values()];
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const findings = auditReleaseTree();
  if (!privateTerms.length) findings.push({ file: "audit configuration", kind: "private term list missing" });
  const archiveEntries = git(["archive", "--format=tar", "HEAD"], { encoding: "buffer", maxBuffer: 30_000_000 });
  const names = execFileSync("tar", ["-tf", "-"], { input: archiveEntries, encoding: "utf8" }).trim().split("\n");
  findings.push(...prohibitedArchivePaths(names).map(file => ({ file, kind: "prohibited committed archive path" })));
  const dirty = git(["status", "--porcelain"]).trim();
  if (dirty) findings.push({ file: "working tree", kind: "uncommitted changes; archive would omit them" });
  if (findings.length) {
    for (const finding of findings) console.error(`${finding.kind}: ${finding.file}`);
    console.error(`Release gate blocked: ${findings.length} finding(s). No archive was created.`);
    process.exitCode = 1;
  } else {
    console.log(`Release source and static-output privacy checks passed (${names.length} committed archive entries).`);
  }
}
