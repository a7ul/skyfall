// A failed child must stay unfinished so REPLACE traversal keeps its loaded
// parent visible. Remove it from the LRU first: the renderer cannot request a
// tile again while an earlier failed entry is still cached.
export function suspendFailedTile(renderer,tile){
  renderer.lruCache.remove(tile);
  tile.internal.loadingState=null;
}

export function releaseFailedTile(tile){
  if(tile.internal.loadingState!==null)return false;
  tile.internal.loadingState=0;
  return true;
}
