import {createRequire} from 'node:module';
import {mkdir,readFile,readdir,rename,stat,unlink,writeFile} from 'node:fs/promises';
import path from 'node:path';

const require=createRequire(import.meta.url);
const {processGlb}=require('gltf-pipeline');
const lyonCache=new Map();
const pendingTiles=new Map();
const cacheRoot=path.resolve('.cache/lyon-photomesh');
const remoteRoot='https://data.grandlyon.com/files/grandlyon/2023/mesh/';
const configuredCacheGB=Number(process.env.LYON_TILE_CACHE_GB||3);
const maxCacheBytes=(Number.isFinite(configuredCacheGB)&&configuredCacheGB>0?configuredCacheGB:3)*1024**3;
const diskEntries=new Map();
let diskBytes=0;
let trimming=null;

async function scanCache(directory=cacheRoot){
  let entries;
  try{entries=await readdir(directory,{withFileTypes:true});}
  catch(error){if(error.code==='ENOENT')return;throw error;}
  for(const entry of entries){
    const file=path.join(directory,entry.name);
    if(entry.isDirectory())await scanCache(file);
    else if(entry.isFile()&&!file.endsWith('.tmp')){
      const info=await stat(file);
      diskEntries.set(path.relative(cacheRoot,file),{size:info.size,used:info.mtimeMs});
      diskBytes+=info.size;
    }
  }
}
const cacheReady=scanCache();

async function trimCache(){
  if(diskBytes<=maxCacheBytes)return;
  if(trimming)return trimming;
  trimming=(async()=>{
    const oldest=[...diskEntries].sort((a,b)=>a[1].used-b[1].used);
    for(const [file,entry] of oldest){
      if(diskBytes<=maxCacheBytes*.9)break;
      if(pendingTiles.has(file))continue;
      try{await unlink(path.join(cacheRoot,file));}
      catch(error){if(error.code!=='ENOENT')throw error;}
      diskEntries.delete(file);
      diskBytes-=entry.size;
    }
  })().finally(()=>{trimming=null;});
  return trimming;
}

async function cachedTile(file){
  await cacheReady;
  const memory=lyonCache.get(file);
  if(memory)return memory;
  if(pendingTiles.has(file))return pendingTiles.get(file);
  const pending=(async()=>{
    const output=path.join(cacheRoot,file);
    let tile;
    try{
      tile=await readFile(output);
      const entry=diskEntries.get(file);
      if(entry)entry.used=Date.now();
    }
    catch(error){
      if(error.code!=='ENOENT')throw error;
      const stale=diskEntries.get(file);
      if(stale){diskEntries.delete(file);diskBytes-=stale.size;}
      const remote=await fetch(new URL(file,remoteRoot),{signal:AbortSignal.timeout(120000)});
      if(!remote.ok){const failure=new Error(`Lyon tile HTTP ${remote.status}`);failure.status=remote.status;throw failure;}
      const source=Buffer.from(await remote.arrayBuffer());
      tile=file.endsWith('.b3dm')?await convertLyonTile(source):source;
      await mkdir(path.dirname(output),{recursive:true});
      const temporary=`${output}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`;
      await writeFile(temporary,tile);
      await rename(temporary,output);
      diskEntries.set(file,{size:tile.length,used:Date.now()});
      diskBytes+=tile.length;
    }
    lyonCache.set(file,tile);
    if(lyonCache.size>96)lyonCache.delete(lyonCache.keys().next().value);
    await trimCache();
    return tile;
  })();
  pendingTiles.set(file,pending);
  try{return await pending;}
  finally{pendingTiles.delete(file);}
}

function removeLegacyRtc(glb){
  const jsonLength=glb.readUInt32LE(12);
  const json=JSON.parse(glb.toString('utf8',20,20+jsonLength));
  if(!json.extensions?.CESIUM_RTC&&!json.extensionsUsed?.includes('CESIUM_RTC'))return glb;
  delete json.extensions?.CESIUM_RTC;
  if(json.extensions&&Object.keys(json.extensions).length===0)delete json.extensions;
  for(const key of ['extensionsUsed','extensionsRequired']){
    if(json[key])json[key]=json[key].filter(name=>name!=='CESIUM_RTC');
    if(json[key]?.length===0)delete json[key];
  }
  const encoded=Buffer.from(JSON.stringify(json));
  const padded=Buffer.concat([encoded,Buffer.alloc((4-encoded.length%4)%4,32)]);
  const header=Buffer.from(glb.subarray(0,20));
  header.writeUInt32LE(20+padded.length+glb.length-(20+jsonLength),8);
  header.writeUInt32LE(padded.length,12);
  return Buffer.concat([header,padded,glb.subarray(20+jsonLength)]);
}

export async function convertLyonTile(source,{draco=false}={}){
  const glbStart=source.indexOf(Buffer.from('glTF'),28);
  if(source.toString('ascii',0,4)!=='b3dm'||glbStart<0)throw new Error('Invalid Lyon b3dm');
  let tile;
  if(source.readUInt32LE(glbStart+4)===1){
    const jsonLength=source.readUInt32LE(glbStart+12);
    const gltf=JSON.parse(source.toString('utf8',glbStart+20,glbStart+20+jsonLength));
    const rtcCenter=gltf.extensions?.CESIUM_RTC?.center;
    const converted=removeLegacyRtc(Buffer.from((await processGlb(source.subarray(glbStart),draco?{dracoOptions:{compressionLevel:7,quantizePositionBits:14,quantizeNormalBits:10,quantizeTexcoordBits:12}}:{})).glb));
    if(rtcCenter){
      const ftJsonLength=source.readUInt32LE(12);
      const ftBinaryLength=source.readUInt32LE(16);
      const btJsonLength=source.readUInt32LE(20);
      const btBinaryLength=source.readUInt32LE(24);
      const feature=ftJsonLength?JSON.parse(source.toString('utf8',28,28+ftJsonLength)):{};
      feature.RTC_CENTER=rtcCenter;
      const json=Buffer.from(JSON.stringify(feature));
      const otherBytes=ftBinaryLength+btJsonLength+btBinaryLength;
      const padding=(8-(28+json.length+otherBytes)%8)%8;
      const padded=Buffer.concat([json,Buffer.alloc(padding,32)]);
      const header=Buffer.from(source.subarray(0,28));
      header.writeUInt32LE(padded.length,12);
      tile=Buffer.concat([header,padded,source.subarray(28+ftJsonLength,glbStart),converted]);
    }else tile=Buffer.concat([source.subarray(0,glbStart),converted]);
    tile.writeUInt32LE(tile.length,8);
  }else tile=source;
  const embedded=tile.indexOf(Buffer.from('glTF'),28);
  if(embedded>=0){
    const clean=removeLegacyRtc(tile.subarray(embedded));
    if(clean.length!==tile.length-embedded){
      tile=Buffer.concat([tile.subarray(0,embedded),clean]);
      tile.writeUInt32LE(tile.length,8);
    }
  }
  return tile;
}

export function lyonLegacyTiles(){
  const install=server=>{
    server.middlewares.use(async(req,res,next)=>{
      if(!/^\/lyon-photomesh\//.test(req.url||''))return next();
      try{
        const path=decodeURIComponent(req.url.split('?')[0].replace(/^\/lyon-photomesh\//,''));
        if(!/^[A-Za-z0-9_.\/-]+$/.test(path)||path.split('/').some(part=>!part||part==='.'||part==='..')||!/(\.json|\.b3dm)$/.test(path))throw new Error('Invalid tile path');
        const tile=await cachedTile(path);
        res.setHeader('Content-Type',path.endsWith('.json')?'application/json':'application/octet-stream');
        // The public 2023 tiles are immutable. Let the browser retain converted
        // payloads across turns so revisiting a block does not re-fetch/convert.
        res.setHeader('Cache-Control','public, max-age=86400');
        res.setHeader('Content-Length',tile.length);
        res.end(tile);
      }catch(error){server.config.logger.error(`Lyon tile conversion failed: ${error}`);res.statusCode=error.status||502;res.end('Tile conversion failed');}
    });
  };
  return {name:'lyon-legacy-gltf-conversion',configureServer:install,configurePreviewServer:install};
}
