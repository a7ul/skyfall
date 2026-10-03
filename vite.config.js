import {defineConfig} from 'vite';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';

const require=createRequire(import.meta.url);
const {processGlb}=require('gltf-pipeline');
const lyonCache=new Map();

function lyonLegacyTiles(){
  const install=server=>{
    server.middlewares.use(async(req,res,next)=>{
      if(!/^\/lyon-photomesh\//.test(req.url||''))return next();
      try{
        const path=decodeURIComponent(req.url.split('?')[0].replace(/^\/lyon-photomesh\//,''));
        if(!/^[A-Za-z0-9_.\/-]+$/.test(path)||path.split('/').includes('..')||!/(\.json|\.b3dm)$/.test(path))throw new Error('Invalid tile path');
        let tile=lyonCache.get(path);
        if(!tile){
          const remote=await fetch(`https://data.grandlyon.com/files/grandlyon/2023/mesh/${path}`);
          if(!remote.ok){res.statusCode=remote.status;res.end(`Lyon tile ${remote.status}`);return;}
          const source=Buffer.from(await remote.arrayBuffer());
          if(path.endsWith('.b3dm')){
            const glbStart=source.indexOf(Buffer.from('glTF'),28);
            if(source.toString('ascii',0,4)!=='b3dm'||glbStart<0)throw new Error('Invalid Lyon b3dm');
            if(source.readUInt32LE(glbStart+4)===1){
              const jsonLength=source.readUInt32LE(glbStart+12);
              const gltf=JSON.parse(source.toString('utf8',glbStart+20,glbStart+20+jsonLength));
              const rtcCenter=gltf.extensions?.CESIUM_RTC?.center;
              const converted=(await processGlb(source.subarray(glbStart),{})).glb;
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
          }else tile=source;
          lyonCache.set(path,tile);
          if(lyonCache.size>96)lyonCache.delete(lyonCache.keys().next().value);
        }
        res.setHeader('Content-Type',path.endsWith('.json')?'application/json':'application/octet-stream');
        res.setHeader('Cache-Control','no-store');
        res.setHeader('Content-Length',tile.length);
        res.end(tile);
      }catch(error){server.config.logger.error(`Lyon tile conversion failed: ${error}`);res.statusCode=502;res.end('Tile conversion failed');}
    });
  };
  return {name:'lyon-legacy-gltf-conversion',configureServer:install,configurePreviewServer:install};
}

export default defineConfig({
  plugins:[lyonLegacyTiles()],
  build:{
    rollupOptions:{
      input:{
        main:fileURLToPath(new URL('./index.html',import.meta.url)),
        lyon:fileURLToPath(new URL('./lyon.html',import.meta.url))
      }
    }
  }
});
