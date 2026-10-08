import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync } from "node:fs";
import { createHash } from "node:crypto";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assertFreshBuild } from "./build-identity.mjs";

const project=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const runtime=path.join(homedir(),"Library/Application Support/Personal CFO Runtime");
const source=path.join(project,"dist");
if(!existsSync(path.join(source,"server/index.js"))||!existsSync(path.join(source,"client/app-version.json")))throw Error("Build the current app successfully before installing it.");
assertFreshBuild(project,JSON.parse(readFileSync(path.join(source,"client/app-version.json"),"utf8")));
if(process.argv.includes("--check")){console.log("Build matches Git HEAD and current application source.");process.exit(0);}
if(!existsSync(path.join(runtime,"vendor/vinext/dist/server/prod-server.js")))throw Error("Run install-background.command first to create the local runtime.");
const stamp=Date.now().toString();
const staging=path.join(runtime,`dist-update-${stamp}`);
cpSync(source,staging,{recursive:true});
function verify(from,to){
  for(const entry of readdirSync(from,{withFileTypes:true})){
    const a=path.join(from,entry.name), b=path.join(to,entry.name);
    if(entry.isDirectory())verify(a,b);
    else if(entry.isFile()){
      const digest=p=>createHash("sha256").update(readFileSync(p)).digest("hex");
      if(digest(a)!==digest(b))throw Error(`Update verification failed: ${entry.name}`);
    }
  }
}
verify(source,staging);
const current=path.join(runtime,"dist"),previous=path.join(runtime,`dist-previous-${stamp}`);
if(existsSync(current))renameSync(current,previous);
try{renameSync(staging,current)}catch(error){if(existsSync(previous))renameSync(previous,current);throw error;}
mkdirSync(path.join(runtime,"scripts"),{recursive:true});
for(const name of ["run-local.command","pdf-parser-server.py","pdf_text.swift","start-production.mjs"])
  cpSync(path.join(project,"scripts",name),path.join(runtime,"scripts",name));
if(existsSync(path.join(project,"scripts/vendor")))cpSync(path.join(project,"scripts/vendor"),path.join(runtime,"scripts/vendor"),{recursive:true});
console.log(`Installed ${JSON.parse(readFileSync(path.join(current,"client/app-version.json"),"utf8")).version}. Previous build retained at ${previous}`);
