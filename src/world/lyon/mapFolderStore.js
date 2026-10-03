const databaseName='skyfall-map-folders';
const storeName='selected-folders';
const lyonKey='lyon';

function openDatabase(){
  return new Promise((resolve,reject)=>{
    if(!globalThis.indexedDB){reject(new Error('IndexedDB is unavailable'));return;}
    const request=indexedDB.open(databaseName,1);
    request.onupgradeneeded=()=>request.result.createObjectStore(storeName);
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(request.error);
  });
}

async function withStore(mode,operation){
  const database=await openDatabase();
  try{
    return await new Promise((resolve,reject)=>{
      const transaction=database.transaction(storeName,mode);
      const request=operation(transaction.objectStore(storeName));
      let result;
      request.onsuccess=()=>{result=request.result;};
      request.onerror=()=>reject(request.error);
      transaction.onabort=()=>reject(transaction.error);
      transaction.onerror=()=>reject(transaction.error);
      transaction.oncomplete=()=>resolve(result);
    });
  }finally{database.close();}
}

export function savedLyonFolder(){return withStore('readonly',store=>store.get(lyonKey));}
export function rememberLyonFolder(handle){return withStore('readwrite',store=>store.put(handle,lyonKey));}
