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

function cachedTileFile(directory){
  const folders=new Map([['',Promise.resolve(directory)]]);
  const files=new Map();
  return async(name,create=false)=>{
    if(files.has(name))return files.get(name);
    const parts=name.split('/');
    let path='',folder=folders.get('');
    for(const part of parts.slice(0,-1)){
      const parent=folder;
      path=path?`${path}/${part}`:part;
      if(!folders.has(path)){
        const key=path;
        const pending=parent.then(handle=>handle.getDirectoryHandle(part,{create}));
        folders.set(key,pending);
        pending.catch(()=>{if(folders.get(key)===pending)folders.delete(key);});
      }
      folder=folders.get(path);
    }
    const pending=folder.then(handle=>handle.getFileHandle(parts.at(-1),{create}));
    files.set(name,pending);
    pending.catch(()=>{if(files.get(name)===pending)files.delete(name);});
    return pending;
  };
}

async function extractTile(entry,target,name,getEntryBlob){
  let blob;
  try{
    const type=name.endsWith('.json')?'application/json':'application/octet-stream';
    blob=await getEntryBlob(entry,type);
  }catch(error){
    const reason=error?.message||error?.name||'unknown ZIP extraction error';
    throw new Error(`Could not unpack ${name}: ${reason}. Choose the same folder to resume.`,{cause:error});
  }
  for(let attempt=0;attempt<3;attempt++){
    let fileWriter;
    try{
      fileWriter=await target.createWritable();
      await fileWriter.write(blob);
      await fileWriter.close();
      return;
    }catch(error){
      try{await fileWriter?.abort?.();}catch{}
      const permanent=['NotAllowedError','SecurityError','QuotaExceededError'].includes(error?.name);
      if(permanent||attempt===2){
        if(error?.name==='QuotaExceededError'){
          throw new Error(`Storage is full while unpacking ${name}. Free space in the selected folder, then choose it again to resume.`,{cause:error});
        }
        const reason=error?.message||error?.name||'unknown browser extraction error';
        throw new Error(`Could not unpack ${name}: ${reason}. Choose the same folder to resume.`,{cause:error});
      }
      await new Promise(resolve=>setTimeout(resolve,150*2**attempt));
    }
  }
}

function waitForTileRetry(delay,signal){
  if(signal?.aborted)return Promise.reject(signal.reason??new DOMException('Tile request canceled','AbortError'));
  return new Promise((resolve,reject)=>{
    const onAbort=()=>{clearTimeout(timer);reject(signal.reason??new DOMException('Tile request canceled','AbortError'));};
    const timer=setTimeout(()=>{signal?.removeEventListener('abort',onAbort);resolve();},delay);
    signal?.addEventListener('abort',onAbort,{once:true});
  });
}

async function readLocalTile(directory,name,signal,getTile=(path)=>tileFile(directory,path)){
  // File System Access reads can fail briefly while Chrome or the OS is busy.
  // A missing file or revoked permission is permanent until the map changes.
  for(let attempt=0;attempt<5;attempt++){
    if(signal?.aborted)throw signal.reason??new DOMException('Tile request canceled','AbortError');
    try{
      const file=await (await getTile(name)).getFile();
      if(signal?.aborted)throw signal.reason??new DOMException('Tile request canceled','AbortError');
      return file;
    }catch(error){
      if(signal?.aborted)throw signal.reason??new DOMException('Tile request canceled','AbortError');
      if(['NotFoundError','NotAllowedError','SecurityError'].includes(error?.name)||attempt===4)throw error;
      await waitForTileRetry(80*2**attempt,signal);
    }
  }
}

export function folderTileSource(directory,{coverage='complete',tilesetOverrides=new Map()}={}){
  const getTile=cachedTileFile(directory);
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
        const file=await readLocalTile(directory,decoded,signal,getTile);
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
  const entryFiles=new WeakMap();
  const payloadOffsets=new WeakMap();
  async function getEntryBlob(entry,type,signal){
    const file=entryFiles.get(entry);
    // Released map packs use stored ZIP entries. A validated local-header offset
    // lets the browser write a File slice without decoding and copying each tile.
    // Compressed entries still use Zip.js below.
    if(file&&entry.compressionMethod===0&&!entry.encrypted&&entry.compressedSize===entry.uncompressedSize&&Number.isSafeInteger(entry.offset)&&entry.offset>=0&&Number.isSafeInteger(entry.uncompressedSize)){
      let start=payloadOffsets.get(entry);
      if(!start){
        start=file.slice(entry.offset,entry.offset+30).arrayBuffer().then(buffer=>{
          if(buffer.byteLength!==30)return null;
          const header=new DataView(buffer);
          if(header.getUint32(0,true)!==0x04034b50||header.getUint16(8,true)!==0||(header.getUint16(6,true)&1))return null;
          const offset=entry.offset+30+header.getUint16(26,true)+header.getUint16(28,true);
          return offset+entry.uncompressedSize<=file.size?offset:null;
        }).catch(error=>{payloadOffsets.delete(entry);throw error;});
        payloadOffsets.set(entry,start);
      }
      const offset=await start;
      if(offset!==null)return file.slice(offset,offset+entry.uncompressedSize,type);
    }
    return entry.getData(new BlobWriter(type),{signal});
  }
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
        entryFiles.set(entry,file);
      }
    }
    if(!entries.has('tileset.json')||!entries.has('pyramid/tileset.json')){
      throw new Error('These ZIPs do not contain a Lyon map. Select all parts of the converted map pack.');
    }
    const metadata=entries.get('skyfall-map-v2.json')||entries.get('skyfall-map.json');
    if(!metadata)throw new Error('This Lyon map pack has no manifest. Download the current pack and select every part.');
    const manifest=JSON.parse(await getEntryBlob(metadata,'application/json').then(blob=>blob.text()));
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
          const blob=await getEntryBlob(entries.get(name),'application/json');
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
        const getTile=cachedTileFile(output);
        let next=0,done=0,failed=false;
        const worker=async()=>{
          try{
            while(!failed&&next<queue.length){
              const [name,entry]=queue[next++];
              const target=await getTile(name,true);
              let cached=false;
              if(resume){
                try{cached=(await target.getFile()).size===entry.uncompressedSize;}
                catch(error){if(error.name!=='NotFoundError')throw error;}
              }
              if(!cached){
                await extractTile(entry,target,name,getEntryBlob);
              }
              done++;
              if(done%10===0||done===queue.length)onProgress(done,queue.length,false);
            }
          }catch(error){failed=true;throw error;}
        };
        await Promise.all(Array.from({length:Math.min(8,queue.length)},worker));
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
        const blob=await getEntryBlob(entry,type,signal);
        if(signal?.aborted)throw signal.reason;
        return new Response(blob,{headers:{'Content-Type':type}});
      },
      async close(){await Promise.all(readers.map(reader=>reader.close()));}
    };
  }catch(error){await Promise.allSettled(readers.map(reader=>reader.close()));throw error;}
}
