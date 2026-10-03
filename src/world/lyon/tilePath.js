export function posix(folder,relative){
  const parts=[];
  for(const part of `${folder}${relative}`.split('/')){
    if(!part||part==='.')continue;
    if(part==='..')parts.pop();
    else parts.push(part);
  }
  return parts.join('/');
}
