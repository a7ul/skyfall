import {posix as path} from './tilePath.js';

// A cache snapshot contains only tiles visited during capture. Remove missing
// descendants so REPLACE refinement retains the closest available parent mesh.
export function pruneTilesets(tilesets,available){
  const result=new Map();
  const coverage=new Map();
  const visiting=new Set();
  function prune(name){
    if(result.has(name))return coverage.get(name);
    if(visiting.has(name))return null;
    const tileset=tilesets.get(name);
    if(!tileset)return null;
    visiting.add(name);
    const folder=name.slice(0,name.lastIndexOf('/')+1);
    function contentState(content){
      const uri=content?.uri||content?.url;
      if(!uri)return {valid:false,complete:false,renderable:false};
      const target=path(folder,uri.split(/[?#]/)[0]);
      if(!available.has(target))return {valid:false,complete:false,renderable:false};
      if(target.endsWith('.json')){
        const child=prune(target);
        return {valid:!!child?.node,complete:!!child?.complete,renderable:false};
      }
      return {valid:true,complete:true,renderable:true};
    }
    function node(tile){
      const own=[];
      if(tile.content){
        const state=contentState(tile.content);
        own.push(state);
        if(!state.valid)delete tile.content;
      }
      if(tile.contents){
        const contents=tile.contents.map(content=>({content,state:contentState(content)}));
        own.push(...contents.map(({state})=>state));
        tile.contents=contents.filter(({state})=>state.valid).map(({content})=>content);
        if(!tile.contents.length)delete tile.contents;
      }
      const originalChildren=tile.children||[];
      const children=originalChildren.map(node);
      const childrenComplete=children.every(child=>child?.complete);
      const ownComplete=own.every(state=>state.complete);
      const hasRenderableContent=own.some(state=>state.valid&&state.renderable);
      // A REPLACE parent cannot hand off to only some of its children: once
      // the available children load, the uncovered portion becomes a hole.
      // Stop at the nearest tile whose own mesh still covers the whole area.
      if(hasRenderableContent&&(!childrenComplete||!ownComplete)){
        delete tile.children;
        return {node:tile,complete:true};
      }
      if(originalChildren.length){
        tile.children=children.filter(Boolean).map(child=>child.node);
        if(!tile.children.length)delete tile.children;
      }
      if(!tile.content&&!tile.contents?.length&&!tile.children?.length)return null;
      return {node:tile,complete:(own.length===0||ownComplete)&&childrenComplete};
    }
    const root=node(tileset.root);
    tileset.root=root?.node||null;
    visiting.delete(name);
    result.set(name,root?JSON.stringify(tileset):null);
    coverage.set(name,root);
    return root;
  }
  for(const name of tilesets.keys())prune(name);
  return result;
}
