import {test,expect} from 'bun:test';
import {LRUCache} from '3d-tiles-renderer/src/core/renderer/utilities/LRUCache.js';
import {releaseFailedTile,suspendFailedTile} from '../../../src/world/lyon/tileFailureRecovery.js';

test('a failed child remains unfinished and can be requested again after backoff',()=>{
  const lruCache=new LRUCache();
  const tile={internal:{loadingState:-1}};
  expect(lruCache.add(tile,()=>{tile.internal.loadingState=0;})).toBe(true);
  lruCache.setLoaded(tile,true);

  suspendFailedTile({lruCache},tile);
  expect(lruCache.has(tile)).toBe(false);
  expect(tile.internal.loadingState).toBeNull();
  expect(releaseFailedTile(tile)).toBe(true);
  expect(lruCache.add(tile,()=>{})).toBe(true);
  expect(releaseFailedTile(tile)).toBe(false);
});
