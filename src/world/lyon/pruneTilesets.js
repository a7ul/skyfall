import {posix as path} from './tilePath.js';

// A cache snapshot contains only tiles visited during capture. Remove missing
// descendants so REPLACE refinement retains the closest available parent mesh.
export function pruneTilesets(tilesets,available){
  const result=new Map();
  const visiting=new Set();
  function prune(name){
    if(result.has(name))return result.get(name);
    if(visiting.has(name))return null;
    const tileset=tilesets.get(name);
    if(!tileset)return null;
    visiting.add(name);
    const folder=name.slice(0,name.lastIndexOf('/')+1);
    function validContent(content){
      const uri=content?.uri||content?.url;
      if(!uri)return false;
      const target=path(folder,uri.split(/[?#]/)[0]);
      return available.has(target)&&(!target.endsWith('.json')||!!prune(target));
    }
    function node(tile){
      if(tile.content&&!validContent(tile.content))delete tile.content;
      if(tile.contents)tile.contents=tile.contents.filter(validContent);
      if(tile.children)tile.children=tile.children.map(node).filter(Boolean);
      return tile.content||tile.contents?.length||tile.children?.length?tile:null;
    }
    tileset.root=node(tileset.root);
    visiting.delete(name);
    const valid=tileset.root?JSON.stringify(tileset):null;
    result.set(name,valid);
    return valid;
  }
  for(const name of tilesets.keys())prune(name);
  return result;
}
