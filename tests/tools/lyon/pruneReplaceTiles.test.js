import {test,expect} from 'bun:test';
import {pruneReplaceTiles} from '../../../tools/lyon/pruneReplaceTiles.js';

const leaf=id=>({id,content:{uri:`${id}.b3dm`},boundingVolume:{region:[0,0,1,1,0,1]},geometricError:10});

test('partial child selection keeps the complete parent mesh',()=>{
  const source={...leaf('parent'),children:[leaf('near'),leaf('far')]};
  const result=pruneReplaceTiles(source,5,node=>node.id!=='far');
  expect(result.content.uri).toBe('parent.b3dm');
  expect(result.children).toBeUndefined();
  expect(result.geometricError).toBe(0);
});

test('complete child groups retain finer detail',()=>{
  const source={...leaf('parent'),children:[leaf('one'),leaf('two')]};
  const result=pruneReplaceTiles(source,5,()=>true);
  expect(result.children.map(child=>child.id)).toEqual(['one','two']);
});
