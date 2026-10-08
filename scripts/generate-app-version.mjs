import { buildIdentity } from "./build-identity.mjs";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const project=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const output=path.join(project,"public","app-version.json");
const date=(process.env.PERSONAL_CFO_BUILD_DATE??new Date().toISOString().slice(0,10)).replaceAll("-", ".");
const identity=buildIdentity(project);
const revision=identity.revision.slice(0,7);
const version=process.env.PERSONAL_CFO_APP_VERSION??`${date}+${revision}`;

mkdirSync(path.dirname(output),{recursive:true});
writeFileSync(output,`${JSON.stringify({version,description:`Local build from ${revision}`,...identity})}\n`);
console.log(`Prepared app version ${version}`);
