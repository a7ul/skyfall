import {test,expect} from 'bun:test';
import {sampleCollisionHeight,firstHeightIntersection} from '../src/collisionField.js';
import {readFileSync} from 'node:fs';

test('city height field reports rooftops and leaves open water clear',()=>{
  const field={x:-5,z:-5,step:5,width:3,depth:2};
  const heights=new Int16Array([0,240,-32768,120,680,100]);
  expect(sampleCollisionHeight(field,heights,0,-5)).toBe(24);
  expect(sampleCollisionHeight(field,heights,0,0)).toBe(68);
  expect(sampleCollisionHeight(field,heights,5,-5)).toBe(-100);
  expect(sampleCollisionHeight(field,heights,100,0)).toBe(-100);
});

test('buildings block a descending shot before a car behind them',()=>{
  const roof=(x)=>x>45&&x<65?30:0;
  const origin={x:0,y:40,z:0},direction={x:1,y:-.2,z:0};
  expect(firstHeightIntersection(roof,origin,direction,100)).toBeGreaterThan(40);
  expect(firstHeightIntersection(roof,origin,direction,100)).toBeLessThan(70);
  expect(firstHeightIntersection(()=>0,origin,direction,100)).toBeNull();
});

test('bundled Lyon collision field matches the playable road area',()=>{
  const base=new URL('../public/assets/lyon/',import.meta.url);
  const field=JSON.parse(readFileSync(new URL('collision.json',base),'utf8'));
  const bytes=readFileSync(new URL('collision.bin',base));
  const heights=new Int16Array(bytes.buffer,bytes.byteOffset,bytes.byteLength/2);
  expect(heights.length).toBe(field.width*field.depth);
  expect(sampleCollisionHeight(field,heights,0,0)).toBeGreaterThanOrEqual(0);
  expect(sampleCollisionHeight(field,heights,2000,0)).toBe(-100);
});
