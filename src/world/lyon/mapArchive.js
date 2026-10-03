import {BlobReader,BlobWriter,ZipReader} from '@zip.js/zip.js';
import {pruneTilesets} from './pruneTilesets.js';

const tileRoot='lyon-photomesh/';
const allowed=/^[A-Za-z0-9_.\/-]+$/;
const extractedDirectory='skyfall-lyon-map';
const stateFile='.skyfall-map-state.json';

export async function mapZipFilesIn(directory){
  const files=[];
  for await(const [name,handle] of directory.entries()){
    if(handle.kind==='file'&&/^lyon-map-part-\d+\.zip$/i.test(name))files.push(await handle.getFile());
  }
  files.sort((a,b)=>a.name.localeCompare(b.name));
  if(!files.length)throw new Error('No Lyon map ZIP parts found. Download every part into this folder, then choose it again.');
  return files;
}

function sourceKey(files,manifest){
  return `${manifest.map}:${manifest.format}:${files.map(file=>`${file.name}:${file.size}:${file.lastModified}`).join('|')}`;
}

function keyHash(key){
  let hash=2166136261;
  for(let i=0;i<key.length;i++)hash=Math.imul(hash^key.charCodeAt(i),16777619);
  return (hash>>>0).toString(16);
}

async function writeState(directory,state){
  const handle=await directory.getFileHandle(stateFile,{create:true});
  const writable=await handle.createWritable();
  await writable.write(JSON.stringify(state));
  await writable.close();
}

async function readState(directory){
  try{return JSON.parse(await (await directory.getFileHandle(stateFile)).getFile().then(file=>file.text()));}
  catch(error){if(error.name==='NotFoundError'||error instanceof SyntaxError)return null;throw error;}
}

async function tileFile(directory,name,create=false){
  const parts=name.split('/');
  let current=directory;
  for(const part of parts.slice(0,-1))current=await current.getDirectoryHandle(part,{create});
  return current.getFileHandle(parts.at(-1),{create});
}

async function readLocalTile(directory,name,signal){
  // File System Access reads can fail briefly while Chrome or the OS is busy.
  // A missing file or revoked permission is permanent until the map changes.
  for(let attempt=0;attempt<3;attempt++){
    if(signal?.aborted)throw signal.reason;
    try{
      const file=await (await tileFile(directory,name)).getFile();
      if(signal?.aborted)throw signal.reason;
      return file;
    }catch(error){
      if(signal?.aborted||['NotFoundError','NotAllowedError','SecurityError'].includes(error.name)||attempt===2)throw error;
      await new Promise(resolve=>setTimeout(resolve,80*2**attempt));
    }
  }
}

export function folderTileSource(directory,{coverage='complete',tilesetOverrides=new Map()}={}){
  return {
    coverage,
    async fetchData(url,{signal}={}){
      const name=new URL(url,globalThis.location?.href||'http://localhost/').pathname.split('/lyon-photomesh/')[1];
      if(!name)return null;
      if(signal?.aborted)throw signal.reason;
      try{
        const decoded=decodeURIComponent(name);
        if(tilesetOverrides.has(decoded)){
          const json=tilesetOverrides.get(decoded);
          return json?new Response(json,{headers:{'Content-Type':'application/json'}}):new Response('Tileset is absent from this map snapshot.',{status:404});
        }
        const file=await readLocalTile(directory,decoded,signal);
        return new Response(file,{headers:{'Content-Type':name.endsWith('.json')?'application/json':'application/octet-stream'}});
      }catch(error){
        if(error.name!=='NotFoundError')throw error;
        return new Response('Tile is missing from the selected map folder.',{status:404});
      }
    }
  };
}

export async function openMapArchives(files){
  if(!files.length)throw new Error('Choose the Lyon map ZIP files.');
  const readers=[];
  const entries=new Map();
  try{
    for(const file of files){
      const reader=new ZipReader(new BlobReader(file));
      readers.push(reader);
      for(const entry of await reader.getEntries()){
        if(entry.directory)continue;
        let name=entry.filename;
        if(name.startsWith(tileRoot))name=name.slice(tileRoot.length);
        if(!allowed.test(name)||name.split('/').some(part=>!part||part==='.'||part==='..'))continue;
        if(!/\.(json|b3dm)$/.test(name))continue;
        if(entries.has(name))throw new Error(`Duplicate tile in map ZIPs: ${name}`);
        entries.set(name,entry);
      }
    }
    if(!entries.has('tileset.json')||!entries.has('pyramid/tileset.json')){
      throw new Error('These ZIPs do not contain a Lyon map. Select all parts of the converted map pack.');
    }
    const metadata=entries.get('skyfall-map-v2.json')||entries.get('skyfall-map.json');
    if(!metadata)throw new Error('This Lyon map pack has no manifest. Download the current pack and select every part.');
    const manifest=JSON.parse(await metadata.getData(new BlobWriter('application/json')).then(blob=>blob.text()));
    if(manifest.map!=='lyon'||manifest.format!==1||!Array.isArray(manifest.parts))throw new Error('This map pack has an unsupported format.');
    const selected=new Set(files.map(file=>file.name.split(/[\\/]/).pop()));
    const missing=manifest.parts.filter(part=>!selected.has(part));
    if(missing.length)throw new Error(`Select every Lyon map ZIP part. Missing: ${missing.join(', ')}`);
    if(!['complete','visited-cache-snapshot'].includes(manifest.coverage))throw new Error('This map pack has an unsupported coverage type.');
    let snapshotTilesets;
    async function getSnapshotTilesets(){
      if(manifest.coverage==='complete')return new Map();
      if(snapshotTilesets)return snapshotTilesets;
      const names=[...entries.keys()].filter(name=>name.endsWith('.json')&&!name.startsWith('skyfall-map'));
      const parsed=new Map();
      let next=0;
      await Promise.all(Array.from({length:Math.min(8,names.length)},async()=>{
        while(next<names.length){
          const name=names[next++];
          const blob=await entries.get(name).getData(new BlobWriter('application/json'));
          parsed.set(name,JSON.parse(await blob.text()));
        }
      }));
      snapshotTilesets=pruneTilesets(parsed,new Set(entries.keys()));
      return snapshotTilesets;
    }
    return {
      tileCount:entries.size,
      files:files.map(file=>file.name),
      coverage:manifest.coverage,
      async extractInto(chosenDirectory,onProgress=()=>{}){
        const root=await chosenDirectory.getDirectoryHandle(extractedDirectory,{create:true});
        const key=sourceKey(files,manifest);
        const previous=await readState(root);
        const extending=previous?.key&&key.startsWith(`${previous.key}|`);
        const output=previous?.key&&previous.key!==key&&!extending
          ?await root.getDirectoryHandle(`pack-${keyHash(key)}`,{create:true})
          :root;
        const state=await readState(output);
        if(state?.key===key&&state.complete){
          onProgress(entries.size,entries.size,true);
          return folderTileSource(output,{coverage:manifest.coverage,tilesetOverrides:await getSnapshotTilesets()});
        }
        const resume=state?.key===key||!!extending;
        if(state?.key!==key)await writeState(output,{key,complete:false});
        const queue=[...entries];
        let next=0,done=0,failed=false;
        const worker=async()=>{
          try{
            while(!failed&&next<queue.length){
              const [name,entry]=queue[next++];
              const target=await tileFile(output,name,true);
              let cached=false;
              if(resume){
                try{cached=(await target.getFile()).size===entry.uncompressedSize;}
                catch(error){if(error.name!=='NotFoundError')throw error;}
              }
              if(!cached){
                const type=name.endsWith('.json')?'application/json':'application/octet-stream';
                const blob=await entry.getData(new BlobWriter(type));
                const writable=await target.createWritable();
                await writable.write(blob);
                await writable.close();
              }
              done++;
              if(done%10===0||done===queue.length)onProgress(done,queue.length,false);
            }
          }catch(error){failed=true;throw error;}
        };
        const results=await Promise.allSettled(Array.from({length:Math.min(8,queue.length)},worker));
        const failure=results.find(result=>result.status==='rejected');
        if(failure)throw failure.reason;
        await writeState(output,{key,complete:true});
        return folderTileSource(output,{coverage:manifest.coverage,tilesetOverrides:await getSnapshotTilesets()});
      },
      async fetchData(url,{signal}={}){
        const name=new URL(url,globalThis.location?.href||'http://localhost/').pathname.split('/lyon-photomesh/')[1];
        if(!name)return null;
        if(signal?.aborted)throw signal.reason;
        const decoded=decodeURIComponent(name);
        const entry=entries.get(decoded);
        if(!entry)return new Response('Tile is missing from the selected map ZIPs.',{status:404});
        if(decoded.endsWith('.json')){
          const overrides=await getSnapshotTilesets();
          if(overrides.has(decoded)){
            const json=overrides.get(decoded);
            return json?new Response(json,{headers:{'Content-Type':'application/json'}}):new Response('Tileset is absent from this map snapshot.',{status:404});
          }
        }
        const type=name.endsWith('.json')?'application/json':'application/octet-stream';
        const blob=await entry.getData(new BlobWriter(type),{signal});
        if(signal?.aborted)throw signal.reason;
        return new Response(blob,{headers:{'Content-Type':type}});
      },
      async close(){await Promise.all(readers.map(reader=>reader.close()));}
    };
  }catch(error){await Promise.allSettled(readers.map(reader=>reader.close()));throw error;}
}
