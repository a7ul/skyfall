import {createReadStream} from 'node:fs';
import {stat} from 'node:fs/promises';
import path from 'node:path';

const root=path.resolve('release-assets/maps/lyon');

export function localMapPacks(){
  const install=server=>{
    server.middlewares.use(async(req,res,next)=>{
      if(req.url?.startsWith('/lyon-photomesh/')){
        res.statusCode=404;res.end('City tiles are loaded from the selected map folder.');return;
      }
      const filename=req.url?.split('?')[0]?.match(/^\/map-packs\/(lyon-map-part-\d+\.zip|lyon-map-manifest\.json)$/)?.[1];
      if(!filename)return next();
      try{
        const file=path.join(root,filename),info=await stat(file);
        res.setHeader('Content-Type',filename.endsWith('.zip')?'application/zip':'application/json');
        res.setHeader('Content-Length',info.size);
        res.setHeader('Cache-Control','no-store');
        if(filename.endsWith('.zip'))res.setHeader('Content-Disposition',`attachment; filename="${filename}"`);
        if(req.method==='HEAD'){res.end();return;}
        createReadStream(file).pipe(res);
      }catch(error){if(error.code==='ENOENT'){res.statusCode=404;res.end('Build the local map ZIPs first.');}else next(error);}
    });
  };
  return {name:'local-map-packs',configureServer:install,configurePreviewServer:install};
}
