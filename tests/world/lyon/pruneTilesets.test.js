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
  // A partial set of children must not replace the complete low-detail mesh.
  expect(JSON.parse(result.get('pyramid/tileset.json')).root.children).toBeUndefined();
  expect(JSON.parse(result.get('tileset.json')).root.content.uri).toBe('pyramid/tileset.json');
  expect(result.get('pyramid/empty/tileset.json')).toBeNull();
});

test('an incomplete deep branch stops at its own parent while complete siblings keep refining',()=>{
  const tilesets=new Map([['tileset.json',{root:{content:{uri:'root.b3dm'},children:[
    {content:{uri:'left.b3dm'},children:[{content:{uri:'left-a.b3dm'}},{content:{uri:'missing.b3dm'}}]},
    {content:{uri:'right.b3dm'},children:[{content:{uri:'right-a.b3dm'}},{content:{uri:'right-b.b3dm'}}]}
  ]}}]]);
  const available=new Set(['tileset.json','root.b3dm','left.b3dm','left-a.b3dm','right.b3dm','right-a.b3dm','right-b.b3dm']);
  const root=JSON.parse(pruneTilesets(tilesets,available).get('tileset.json')).root;
  expect(root.children).toHaveLength(2);
  expect(root.children[0].children).toBeUndefined();
  expect(root.children[1].children).toHaveLength(2);
});
