import {mkdir,readFile,readdir,stat,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {convertLyonTile} from '../vite/lyonLegacyTiles.js';
import {pruneReplaceTiles} from './pruneReplaceTiles.js';

const remote='https://data.grandlyon.com/files/grandlyon/2023/mesh/';
const destination=path.resolve(process.argv[2]||'dist','lyon-photomesh');
const origin={lat:45.7578,lon:4.8320};
const radiusByDepth={5:2500,6:2500,7:2500,8:2500,9:800};
const maxBytes=900*1024*1024;
const tilePaths=new Set();
const externalPaths=new Set();

async function fetchBuffer(file){
  const response=await fetch(new URL(file,remote),{signal:AbortSignal.timeout(120000)});
  if(!response.ok)throw new Error(`${file}: HTTP ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

function distanceToRegion(region){
  const x0=(region[0]*180/Math.PI-origin.lon)*111320*Math.cos(origin.lat*Math.PI/180);
  const x1=(region[2]*180/Math.PI-origin.lon)*111320*Math.cos(origin.lat*Math.PI/180);
  const z0=(region[1]*180/Math.PI-origin.lat)*111320;
  const z1=(region[3]*180/Math.PI-origin.lat)*111320;
  return Math.hypot(Math.max(x0,0,-x1),Math.max(z0,0,-z1));
}

function collectTilePaths(node,base){
  if(node.content?.uri){
    const file=path.posix.normalize(path.posix.join(base,node.content.uri));
    if(file.startsWith('../')||file.startsWith('/'))throw new Error(`Unsafe tile path: ${file}`);
    if(file.endsWith('.b3dm'))tilePaths.add(file);
    else if(file.endsWith('.json'))externalPaths.add(file);
    else throw new Error(`Unknown tile content: ${file}`);
  }
  for(const child of node.children||[])collectTilePaths(child,base);
}

async function save(file,data){
  const output=path.join(destination,file);
  await mkdir(path.dirname(output),{recursive:true});
  await writeFile(output,data);
}

const root=JSON.parse((await fetchBuffer('tileset.json')).toString());
const pyramid=JSON.parse((await fetchBuffer('pyramid/tileset.json')).toString());
pyramid.root=pruneReplaceTiles(pyramid.root,0,(node,depth)=>{
  const region=node.boundingVolume?.region;
  return !!region&&distanceToRegion(region)<=radiusByDepth[depth];
});
collectTilePaths(pyramid.root,'pyramid');
for(const file of [...externalPaths]){
  const tileset=JSON.parse((await fetchBuffer(file)).toString());
  const rootTile={...tileset.root};
  delete rootTile.children;
  rootTile.geometricError=0;
  tileset.root=rootTile;
  if(rootTile.content?.uri)tilePaths.add(path.posix.normalize(path.posix.join(path.posix.dirname(file),rootTile.content.uri)));
  await save(file,JSON.stringify(tileset));
}
await save('tileset.json',JSON.stringify(root));
await save('pyramid/tileset.json',JSON.stringify(pyramid));
if(process.argv.includes('--plan')){
  console.log(`${tilePaths.size} model tiles, ${externalPaths.size} detail tilesets`);
  process.exit(0);
}

let next=0,total=0;
const paths=[...tilePaths];
async function worker(){
  while(next<paths.length){
    const file=paths[next++];
    let lastError;
    for(let attempt=0;attempt<3;attempt++){
      try{
        const converted=await convertLyonTile(await fetchBuffer(file));
        total+=converted.length;
        if(total>maxBytes)throw new Error(`Lyon pack exceeds ${Math.round(maxBytes/1048576)} MB`);
        await save(file,converted);
        if(next%25===0)console.log(`Converted ${Math.min(next,paths.length)}/${paths.length} tiles, ${Math.round(total/1048576)} MB`);
        lastError=null;break;
      }catch(error){lastError=error;await new Promise(resolve=>setTimeout(resolve,500*(attempt+1)));}
    }
    if(lastError)throw lastError;
  }
}
console.log(`Building static Lyon pack: ${paths.length} models, ${externalPaths.size} nested tilesets`);
await Promise.all(Array.from({length:4},()=>worker()));

const visited=new Set();
let models=0;
async function verifyTileset(file){
  if(visited.has(file))return;
  visited.add(file);
  const tileset=JSON.parse(await readFile(path.join(destination,file),'utf8'));
  async function verifyNode(node){
    if(node.content?.uri){
      const target=path.posix.normalize(path.posix.join(path.posix.dirname(file),node.content.uri));
      if(target.startsWith('../')||target.startsWith('/'))throw new Error(`Unsafe output reference: ${target}`);
      if(target.endsWith('.json'))await verifyTileset(target);
      else if(target.endsWith('.b3dm')){
        const tile=await readFile(path.join(destination,target));
        const glb=tile.indexOf(Buffer.from('glTF'),28);
        if(tile.toString('ascii',0,4)!=='b3dm'||tile.readUInt32LE(8)!==tile.length||glb<0||tile.readUInt32LE(glb+4)!==2)throw new Error(`Invalid converted tile: ${target}`);
        models++;
      }else throw new Error(`Unknown output reference: ${target}`);
    }
    for(const child of node.children||[])await verifyNode(child);
  }
  await verifyNode(tileset.root);
}
await verifyTileset('tileset.json');

async function directorySize(directory){
  let bytes=0;
  for(const entry of await readdir(directory,{withFileTypes:true})){
    const file=path.join(directory,entry.name);
    bytes+=entry.isDirectory()?await directorySize(file):(await stat(file)).size;
  }
  return bytes;
}
const siteBytes=await directorySize(path.dirname(destination));
if(siteBytes>1024**3)throw new Error(`Pages site exceeds 1 GiB: ${siteBytes} bytes`);
console.log(`Static Lyon pack complete: ${models} linked models in ${visited.size} tilesets; site ${Math.round(siteBytes/1048576)} MiB`);
