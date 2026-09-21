import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import archiver from 'archiver';

const root=process.cwd();const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));const version=pkg.version;const dist=path.join(root,'dist');const destination=path.join(root,'release','artifacts');
const installer=`Dentiva-${version}-x64-nsis.exe`;const portable=`Dentiva-${version}-x64-portable.exe`;const unpacked=path.join(dist,'win-unpacked');const executable=path.join(unpacked,'Dentiva.exe');
function requireBinary(file,label){if(!fs.existsSync(file))throw new Error(`${label} is missing: ${file}`);const stat=fs.statSync(file);if(!stat.isFile()||stat.size<1_000_000)throw new Error(`${label} is unexpectedly small (${stat.size} bytes).`);const signature=fs.readFileSync(file,{encoding:null}).subarray(0,2).toString('ascii');if(signature!=='MZ')throw new Error(`${label} is not a Windows executable.`);}
requireBinary(path.join(dist,installer),'NSIS installer');requireBinary(path.join(dist,portable),'Portable executable');requireBinary(executable,'Unpacked Dentiva executable');
fs.rmSync(destination,{recursive:true,force:true});fs.mkdirSync(destination,{recursive:true});
for(const name of [installer,portable])fs.copyFileSync(path.join(dist,name),path.join(destination,name));
const zipName=`Dentiva-${version}-windows-x64-portable.zip`;const zipPath=path.join(destination,zipName);await new Promise((resolve,reject)=>{const output=fs.createWriteStream(zipPath,{mode:0o600});const archive=archiver('zip',{zlib:{level:9}});output.on('close',resolve);output.on('error',reject);archive.on('warning',(error)=>error.code==='ENOENT'?console.warn(error.message):reject(error));archive.on('error',reject);archive.pipe(output);archive.directory(unpacked,`Dentiva-${version}-windows-x64`);void archive.finalize();});
if(fs.statSync(zipPath).size<1_000_000)throw new Error('Portable ZIP is unexpectedly small.');
const documents=[['README.md','README.md'],['docs/USER_GUIDE.md','USER_GUIDE.md'],['docs/BACKUP_AND_RECOVERY.md','BACKUP_AND_RECOVERY.md'],['docs/SECURITY.md','SECURITY.md'],['docs/DEPLOYMENT.md','DEPLOYMENT.md'],['CHANGELOG.md','CHANGELOG.md'],['LICENSE.txt','LICENSE.txt'],['THIRD_PARTY_NOTICES.md','THIRD_PARTY_NOTICES.md']];for(const [source,name] of documents){const file=path.join(root,source);if(!fs.existsSync(file))throw new Error(`Release document is missing: ${source}`);fs.copyFileSync(file,path.join(destination,name));}
async function sha256(file){const hash=createHash('sha256');await pipeline(fs.createReadStream(file),hash);return hash.digest('hex');}
const binaryNames=[installer,portable,zipName];const hashes=[];for(const name of binaryNames)hashes.push(`${await sha256(path.join(destination,name))}  ${name}`);fs.writeFileSync(path.join(destination,'SHA256SUMS.txt'),`${hashes.join('\n')}\n`);
const manifest={product:'Dentiva',version,target:'windows-x64',generatedAt:new Date().toISOString(),artifacts:await Promise.all(binaryNames.map(async(name)=>({name,sizeBytes:fs.statSync(path.join(destination,name)).size,sha256:await sha256(path.join(destination,name))}))),sourceCommit:process.env.GITHUB_SHA??null,unsigned:!process.env.DENTIVA_RELEASE_SIGNED};fs.writeFileSync(path.join(destination,'RELEASE_MANIFEST.json'),`${JSON.stringify(manifest,null,2)}\n`);
console.log(`Dentiva ${version} release staged in ${destination}`);for(const line of hashes)console.log(line);
