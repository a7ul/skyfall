import {readFile,mkdir,writeFile,rename,stat} from 'node:fs/promises';
import path from 'node:path';
import {convertLyonTile} from './convert_lyon_tile.mjs';

const list=JSON.parse(await readFile(process.argv[2]||'.cache/lyon-expansion-files.json','utf8'));
const root=path.resolve('.cache/lyon-photomesh');
const remote='https://data.grandlyon.com/files/grandlyon/2023/mesh/';
let next=0,done=0,bytes=0;
const failures=[];
async function worker(){
  while(next<list.length){
    const name=list[next++];
    const target=path.join(root,name);
    try{
      try{await stat(target);done++;continue;}catch(error){if(error.code!=='ENOENT')throw error;}
      const response=await fetch(new URL(name,remote),{signal:AbortSignal.timeout(120000)});
      if(!response.ok)throw new Error(`HTTP ${response.status}`);
      const raw=Buffer.from(await response.arrayBuffer());
      const data=name.endsWith('.b3dm')?await convertLyonTile(raw):raw;
      await mkdir(path.dirname(target),{recursive:true});
      const temporary=`${target}.${process.pid}.tmp`;
      await writeFile(temporary,data);
      await rename(temporary,target);
      bytes+=data.length;
      done++;
      if(done%20===0||done===list.length)process.stdout.write(`${done}/${list.length} · ${(bytes/1048576).toFixed(0)} MiB new\n`);
    }catch(error){failures.push(`${name}: ${error.message}`);process.stderr.write(`Failed ${name}: ${error.message}\n`);}
  }
}
await Promise.all(Array.from({length:4},worker));
if(failures.length)throw new Error(`${failures.length} Lyon tiles failed. Rerun to resume.`);
process.stdout.write(`Fetched ${list.length} selected tiles; ${(bytes/1048576).toFixed(0)} MiB added.\n`);
