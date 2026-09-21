import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

const root=process.cwd();
const lock=JSON.parse(fs.readFileSync(path.join(root,'package-lock.json'),'utf8'));
const entries=[];
for(const [relative,meta] of Object.entries(lock.packages??{})){
  if(!relative||meta.dev===true)continue;
  const directory=path.join(root,relative);
  let manifest={};
  try{manifest=JSON.parse(fs.readFileSync(path.join(directory,'package.json'),'utf8'));}catch{}
  const fallback=relative.replace(/^.*node_modules\//,'');
  entries.push({name:manifest.name??fallback,version:meta.version??manifest.version??'unknown',license:meta.license??manifest.license??'See upstream package',directory});
}
entries.push({name:'electron',version:lock.packages?.['node_modules/electron']?.version??'44.4.3',license:'MIT',directory:path.join(root,'node_modules/electron')});
entries.sort((a,b)=>a.name.localeCompare(b.name)||a.version.localeCompare(b.version));
const unique=[];const seen=new Set();for(const item of entries){const key=`${item.name}@${item.version}`;if(!seen.has(key)){seen.add(key);unique.push(item);}}

const groups=new Map();
for(const item of unique){
  if(!fs.existsSync(item.directory))continue;
  const candidates=fs.readdirSync(item.directory).filter((name)=>/^(licen[cs]e|copying|notice)(\.|$)/i.test(name)).sort((a,b)=>a.length-b.length);
  if(!candidates.length)continue;
  const file=path.join(item.directory,candidates[0]);
  if(!fs.statSync(file).isFile()||fs.statSync(file).size>200_000)continue;
  const text=fs.readFileSync(file,'utf8').replace(/\r\n?/g,'\n').replace(/[ \t]+$/gm,'').trim();if(!text)continue;
  const hash=createHash('sha256').update(text).digest('hex');const group=groups.get(hash)??{text,packages:[]};group.packages.push(`${item.name}@${item.version}`);groups.set(hash,group);
}

let output=`# Dentiva Third-Party Notices\n\nDentiva 1.0.0 incorporates the components listed below. They remain governed by their respective licences; nothing in Dentiva's end-user licence restricts rights granted for those components. Versions come from the release lockfile. Optional/platform packages are listed for completeness and may not be present in every artifact.\n\nThe packaged Electron runtime also carries its own \`LICENSE\` and \`LICENSES.chromium.html\` files covering Electron, Chromium, Node.js, and their transitive components. Those runtime notices are authoritative and are distributed beside Dentiva's executable. Source offers required by an applicable third-party licence may be requested through the support address in the README.\n\n## Component inventory\n\n| Component | Version | Declared licence |\n|---|---:|---|\n`;
for(const item of unique)output+=`| ${item.name.replaceAll('|','\\|')} | ${item.version} | ${String(item.license).replaceAll('|','\\|')} |\n`;
output+=`\n## Included licence and copyright texts\n\nThe following texts are reproduced from installed component packages. A heading may cover several packages that ship the same text.\n`;
for(const {text,packages} of [...groups.values()].sort((a,b)=>a.packages[0].localeCompare(b.packages[0]))){output+=`\n### ${packages.join(', ')}\n\n\`\`\`text\n${text.replaceAll('```','` ` `')}\n\`\`\`\n`;}
output+=`\n---\n\nNotices generated deterministically from \`package-lock.json\` and installed package licence files by \`scripts/generate-notices.mjs\`. Dentiva itself is licensed under \`LICENSE.txt\`.\n`;
fs.writeFileSync(path.join(root,'THIRD_PARTY_NOTICES.md'),output);
console.log(`Wrote THIRD_PARTY_NOTICES.md for ${unique.length} components and ${groups.size} unique licence texts.`);
