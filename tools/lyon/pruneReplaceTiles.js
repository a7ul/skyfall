// REPLACE tiles hide their parent when refined. Keeping only some siblings
// exposes uncovered parts of the parent as holes in the city mesh.
export function pruneReplaceTiles(node,depth,keep){
  if(depth>4&&!keep(node,depth))return null;
  const copy={...node};
  if(node.children?.length){
    const children=node.children.map(child=>pruneReplaceTiles(child,depth+1,keep));
    if(children.every(Boolean))copy.children=children;
    else{delete copy.children;copy.geometricError=0;}
  }
  return copy;
}
