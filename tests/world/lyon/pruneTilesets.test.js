import {expect,test} from 'bun:test';
import {pruneTilesets} from '../../../src/world/lyon/pruneTilesets.js';

test('snapshot refinement stops at available parent tiles',()=>{
  const tilesets=new Map([
    ['tileset.json',{root:{content:{uri:'pyramid/tileset.json'}}}],
    ['pyramid/tileset.json',{root:{content:{uri:'low.b3dm'},children:[
      {content:{uri:'high.b3dm'}},
      {content:{uri:'missing.b3dm'}},
      {content:{uri:'empty/tileset.json'}}
    ]}}],
    ['pyramid/empty/tileset.json',{root:{content:{uri:'missing.b3dm'}}}]
  ]);
  const available=new Set([...tilesets.keys(),'pyramid/low.b3dm','pyramid/high.b3dm']);
  const result=pruneTilesets(tilesets,available);
  expect(JSON.parse(result.get('pyramid/tileset.json')).root.children).toEqual([{content:{uri:'high.b3dm'}}]);
  expect(JSON.parse(result.get('tileset.json')).root.content.uri).toBe('pyramid/tileset.json');
  expect(result.get('pyramid/empty/tileset.json')).toBeNull();
});
