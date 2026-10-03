import {createRequire} from 'node:module';

const require=createRequire(import.meta.url);
const {processGlb}=require('gltf-pipeline');

function removeLegacyRtc(glb){
  const jsonLength=glb.readUInt32LE(12);
  const json=JSON.parse(glb.toString('utf8',20,20+jsonLength));
  if(!json.extensions?.CESIUM_RTC&&!json.extensionsUsed?.includes('CESIUM_RTC'))return glb;
  delete json.extensions?.CESIUM_RTC;
  if(json.extensions&&Object.keys(json.extensions).length===0)delete json.extensions;
  for(const key of ['extensionsUsed','extensionsRequired']){
    if(json[key])json[key]=json[key].filter(name=>name!=='CESIUM_RTC');
    if(json[key]?.length===0)delete json[key];
  }
  const encoded=Buffer.from(JSON.stringify(json));
  const padded=Buffer.concat([encoded,Buffer.alloc((4-encoded.length%4)%4,32)]);
  const header=Buffer.from(glb.subarray(0,20));
  header.writeUInt32LE(20+padded.length+glb.length-(20+jsonLength),8);
  header.writeUInt32LE(padded.length,12);
  return Buffer.concat([header,padded,glb.subarray(20+jsonLength)]);
}

export async function convertLyonTile(source){
  const glbStart=source.indexOf(Buffer.from('glTF'),28);
  if(source.toString('ascii',0,4)!=='b3dm'||glbStart<0)throw new Error('Invalid Lyon b3dm');
  let tile;
  if(source.readUInt32LE(glbStart+4)===1){
    const jsonLength=source.readUInt32LE(glbStart+12);
    const gltf=JSON.parse(source.toString('utf8',glbStart+20,glbStart+20+jsonLength));
    const rtcCenter=gltf.extensions?.CESIUM_RTC?.center;
    const converted=removeLegacyRtc(Buffer.from((await processGlb(source.subarray(glbStart),{})).glb));
    if(rtcCenter){
      const ftJsonLength=source.readUInt32LE(12),ftBinaryLength=source.readUInt32LE(16);
      const btJsonLength=source.readUInt32LE(20),btBinaryLength=source.readUInt32LE(24);
      const feature=ftJsonLength?JSON.parse(source.toString('utf8',28,28+ftJsonLength)):{};
      feature.RTC_CENTER=rtcCenter;
      const json=Buffer.from(JSON.stringify(feature));
      const otherBytes=ftBinaryLength+btJsonLength+btBinaryLength;
      const padding=(8-(28+json.length+otherBytes)%8)%8;
      const padded=Buffer.concat([json,Buffer.alloc(padding,32)]);
      const header=Buffer.from(source.subarray(0,28));
      header.writeUInt32LE(padded.length,12);
      tile=Buffer.concat([header,padded,source.subarray(28+ftJsonLength,glbStart),converted]);
    }else tile=Buffer.concat([source.subarray(0,glbStart),converted]);
    tile.writeUInt32LE(tile.length,8);
  }else tile=source;
  const embedded=tile.indexOf(Buffer.from('glTF'),28);
  if(embedded>=0){
    const clean=removeLegacyRtc(tile.subarray(embedded));
    if(clean.length!==tile.length-embedded){
      tile=Buffer.concat([tile.subarray(0,embedded),clean]);
      tile.writeUInt32LE(tile.length,8);
    }
  }
  return tile;
}
