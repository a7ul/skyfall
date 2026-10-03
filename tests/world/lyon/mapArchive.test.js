import {describe,expect,test} from 'bun:test';
import {BlobWriter,TextReader,ZipWriter} from '@zip.js/zip.js';
import {folderTileSource,mapZipFilesIn,openMapArchives} from '../../../src/world/lyon/mapArchive.js';

class MemoryFileHandle{
  kind='file';
  constructor(name,file=null){this.name=name;this.file=file||new File([],name);this.writeFailures=0;this.writeAttempts=0;}
  async getFile(){return this.file;}
  async createWritable(){
    const chunks=[];
    return {
      write:async data=>{this.writeAttempts++;if(this.writeFailures-->0)throw new Error('Temporary write failure');chunks.push(data);},
      close:async()=>{this.file=new File(chunks,this.name);},
      abort:async()=>{}
    };
  }
}
class MemoryDirectory{
  kind='directory';
  constructor(){this.items=new Map();}
  async *entries(){yield* this.items.entries();}
  async getDirectoryHandle(name,{create=false}={}){
    if(!this.items.has(name)&&create)this.items.set(name,new MemoryDirectory());
    const item=this.items.get(name);
    if(item?.kind==='directory')return item;
    throw new DOMException('Directory missing','NotFoundError');
  }
  async getFileHandle(name,{create=false}={}){
    if(!this.items.has(name)&&create)this.items.set(name,new MemoryFileHandle(name));
    const item=this.items.get(name);
    if(item?.kind==='file')return item;
    throw new DOMException('File missing','NotFoundError');
  }
}

async function pack(name,files,{level}={}){
  const writer=new ZipWriter(new BlobWriter());
  for(const [path,content] of Object.entries(files))await writer.add(path,new TextReader(content),level===undefined?{}:{level});
  return new File([await writer.close()],name,{type:'application/zip'});
}

describe('Lyon map ZIP reader',()=>{
  test('reuses a local tile handle when a tile is requested again',async()=>{
    const directory=new MemoryDirectory();
    directory.items.set('tile.b3dm',new MemoryFileHandle('tile.b3dm',new File(['mesh'],'tile.b3dm')));
    const getFileHandle=directory.getFileHandle.bind(directory);
    let lookups=0;
    directory.getFileHandle=async(...args)=>{lookups++;return getFileHandle(...args);};
    const source=folderTileSource(directory);
    for(let i=0;i<2;i++)expect(await (await source.fetchData('http://localhost/lyon-photomesh/tile.b3dm')).text()).toBe('mesh');
    expect(lookups).toBe(1);
  });

  test('reads stored ZIP tiles without changing their bytes',async()=>{
    const directory=new MemoryDirectory();
    const file=await pack('lyon-map-part-01.zip',{
      'tileset.json':'{"root":1}',
      'pyramid/tileset.json':'{}',
      'Tile-1/u-00000.b3dm':'stored tile bytes',
      'skyfall-map.json':JSON.stringify({map:'lyon',format:1,coverage:'complete',parts:['lyon-map-part-01.zip']})
    },{level:0});
    const archive=await openMapArchives([file]);
    const url='http://localhost/lyon-photomesh/Tile-1/u-00000.b3dm';
    expect(await (await archive.fetchData(url)).text()).toBe('stored tile bytes');
    await archive.extractInto(directory);
    const output=await directory.getDirectoryHandle('skyfall-lyon-map');
    expect(await (await folderTileSource(output).fetchData(url)).text()).toBe('stored tile bytes');
    await archive.close();
  });

  test('keeps retrying a temporary local tile read failure',async()=>{
    const directory=new MemoryDirectory();
    const handle=new MemoryFileHandle('tile.b3dm',new File(['mesh'],'tile.b3dm'));
    const read=handle.getFile.bind(handle);
    let attempts=0;
    handle.getFile=async()=>{
      if(++attempts<5)throw new DOMException('File is temporarily busy','NotReadableError');
      return read();
    };
    directory.items.set('tile.b3dm',handle);
    const response=await folderTileSource(directory).fetchData('http://localhost/lyon-photomesh/tile.b3dm');
    expect(await response.text()).toBe('mesh');
    expect(attempts).toBe(5);
  });

  test('cancels a pending tile read retry when the renderer no longer needs it',async()=>{
    const directory=new MemoryDirectory();
    const handle=new MemoryFileHandle('tile.b3dm');
    handle.getFile=async()=>{throw new DOMException('File is temporarily busy','NotReadableError');};
    directory.items.set('tile.b3dm',handle);
    const controller=new AbortController();
    const pending=folderTileSource(directory).fetchData('http://localhost/lyon-photomesh/tile.b3dm',{signal:controller.signal});
    controller.abort();
    await expect(pending).rejects.toHaveProperty('name','AbortError');
  });

  test('loads root and detailed tiles from separate selected parts',async()=>{
    const first=await pack('part-01.zip',{'tileset.json':'{"root":1}','pyramid/tileset.json':'{"pyramid":1}','skyfall-map.json':JSON.stringify({map:'lyon',format:1,coverage:'complete',parts:['part-01.zip','part-02.zip']})});
    const second=await pack('part-02.zip',{'Tile-1/u-00000.b3dm':'tile bytes'});
    const archive=await openMapArchives([first,second]);
    expect(archive.tileCount).toBe(4);
    const root=await archive.fetchData('http://localhost/lyon-photomesh/tileset.json');
    expect(await root.json()).toEqual({root:1});
    const tile=await archive.fetchData('http://localhost/lyon-photomesh/Tile-1/u-00000.b3dm');
    expect(await tile.text()).toBe('tile bytes');
    expect((await archive.fetchData('http://localhost/lyon-photomesh/missing.b3dm')).status).toBe(404);
    await archive.close();
  });

  test('requires every ZIP part before enabling the map',async()=>{
    const first=await pack('part-01.zip',{'tileset.json':'{}','pyramid/tileset.json':'{}','skyfall-map.json':JSON.stringify({map:'lyon',format:1,coverage:'complete',parts:['part-01.zip','part-02.zip']})});
    let message='';
    try{await openMapArchives([first]);}catch(error){message=error.message;}
    expect(message).toContain('Missing: part-02.zip');
  });

  test('plays a cache snapshot locally without a network tile fallback',async()=>{
    const snapshot=await pack('snapshot.zip',{'tileset.json':'{}','pyramid/tileset.json':'{}','skyfall-map.json':JSON.stringify({map:'lyon',format:1,coverage:'visited-cache-snapshot',parts:['snapshot.zip']})});
    const local=await openMapArchives([snapshot]);
    expect(local.coverage).toBe('visited-cache-snapshot');
    expect((await local.fetchData('http://localhost/lyon-photomesh/missing.b3dm')).status).toBe(404);
    await local.close();
  });

  test('a snapshot keeps its available parent when fine tiles are absent',async()=>{
    const directory=new MemoryDirectory();
    const snapshot=await pack('lyon-map-part-01.zip',{
      'tileset.json':JSON.stringify({root:{content:{uri:'pyramid/tileset.json'}}}),
      'pyramid/tileset.json':JSON.stringify({root:{content:{uri:'low.b3dm'},children:[{content:{uri:'missing.b3dm'}}]}}),
      'pyramid/low.b3dm':'low resolution city',
      'skyfall-map.json':JSON.stringify({map:'lyon',format:1,coverage:'visited-cache-snapshot',parts:['lyon-map-part-01.zip']})
    });
    directory.items.set(snapshot.name,new MemoryFileHandle(snapshot.name,snapshot));
    const archive=await openMapArchives([snapshot]);
    const source=await archive.extractInto(directory);
    const pyramid=await (await source.fetchData('http://localhost/lyon-photomesh/pyramid/tileset.json')).json();
    expect(pyramid.root.content.uri).toBe('low.b3dm');
    expect(pyramid.root.children).toBeUndefined();
    expect(await (await source.fetchData('http://localhost/lyon-photomesh/pyramid/low.b3dm')).text()).toBe('low resolution city');
    await archive.close();
  });

  test('unpacks all tiles before launch and reuses prepared files',async()=>{
    const directory=new MemoryDirectory();
    const first=await pack('lyon-map-part-01.zip',{'tileset.json':'{"root":1}','pyramid/tileset.json':'{}','skyfall-map.json':JSON.stringify({map:'lyon',format:1,coverage:'complete',parts:['lyon-map-part-01.zip']})});
    directory.items.set(first.name,new MemoryFileHandle(first.name,first));
    directory.items.set('other.zip',new MemoryFileHandle('other.zip'));
    const files=await mapZipFilesIn(directory);
    expect(files.map(file=>file.name)).toEqual(['lyon-map-part-01.zip']);
    const archive=await openMapArchives(files);
    const progress=[];
    const source=await archive.extractInto(directory,(done,total,reused)=>progress.push({done,total,reused}));
    const output=await directory.getDirectoryHandle('skyfall-lyon-map');
    expect(progress.at(-1)).toEqual({done:3,total:3,reused:false});
    expect(output.items.has('tileset.json')).toBe(true);
    expect(output.items.has('pyramid')).toBe(true);
    expect(await (await source.fetchData('http://localhost/lyon-photomesh/tileset.json')).json()).toEqual({root:1});
    expect((await source.fetchData('http://localhost/lyon-photomesh/absent.b3dm')).status).toBe(404);
    await archive.extractInto(directory,(done,total,reused)=>progress.push({done,total,reused}));
    expect(progress.at(-1)).toEqual({done:3,total:3,reused:true});
    await archive.close();
  });

  test('retries a failed tile write',async()=>{
    const directory=new MemoryDirectory();
    const output=new MemoryDirectory();
    const target=new MemoryFileHandle('tile.b3dm');
    target.writeFailures=1;
    output.items.set('tile.b3dm',target);
    directory.items.set('skyfall-lyon-map',output);
    const part=await pack('lyon-map-part-01.zip',{
      'tileset.json':'{"root":1}',
      'pyramid/tileset.json':'{"root":2}',
      'tile.b3dm':'streamed tile bytes',
      'skyfall-map.json':JSON.stringify({map:'lyon',format:1,coverage:'complete',parts:['lyon-map-part-01.zip']})
    });
    const archive=await openMapArchives([part]);
    await archive.extractInto(directory);
    expect(target.writeAttempts).toBe(2);
    expect(await target.getFile().then(file=>file.text())).toBe('streamed tile bytes');
    await archive.close();
  });

  test('reports the failed tile and resumes from files already extracted',async()=>{
    const directory=new MemoryDirectory();
    const output=new MemoryDirectory();
    const target=new MemoryFileHandle('tile.b3dm');
    target.writeFailures=3;
    output.items.set('tile.b3dm',target);
    directory.items.set('skyfall-lyon-map',output);
    const part=await pack('lyon-map-part-01.zip',{
      'tileset.json':'{"root":1}',
      'pyramid/tileset.json':'{"root":2}',
      'tile.b3dm':'recoverable tile',
      'skyfall-map.json':JSON.stringify({map:'lyon',format:1,coverage:'complete',parts:['lyon-map-part-01.zip']})
    });
    const archive=await openMapArchives([part]);
    await expect(archive.extractInto(directory)).rejects.toThrow('Could not unpack tile.b3dm');
    target.writeFailures=0;
    await archive.extractInto(directory);
    expect(await (await output.getFileHandle('tileset.json')).getFile().then(file=>file.text())).toBe('{"root":1}');
    expect(await target.getFile().then(file=>file.text())).toBe('recoverable tile');
    await archive.close();
  });

  test('rejects a ZIP that is not a Lyon map',async()=>{
    const wrong=await pack('wrong.zip',{'unrelated.txt':'hello'});
    let message='';
    try{await openMapArchives([wrong]);}catch(error){message=error.message;}
    expect(message).toContain('do not contain a Lyon map');
  });
});
