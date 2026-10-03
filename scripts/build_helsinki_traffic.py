"""Convert OpenStreetMap city-center road ways to local car routes.
Download the public OSM XML map for bbox 24.942,60.166,24.958,60.175
from https://api.openstreetmap.org/api/0.6/map (no API key) to /tmp/helsinki-osm.xml.
Roads © OpenStreetMap contributors, ODbL.
"""
import json
import math
import xml.etree.ElementTree as ET
from pathlib import Path
import numpy as np
import trimesh
from pyproj import Transformer
from scipy.spatial import cKDTree

OUT=Path('public/assets/helsinki')
transform=Transformer.from_crs(4326,3879,always_xy=True)
root=ET.parse('/tmp/helsinki-osm.xml').getroot()
nodes={n.attrib['id']:(float(n.attrib['lon']),float(n.attrib['lat'])) for n in root.findall('node')}
print('nodes',len(nodes),flush=True)
points=[]
for file in OUT.glob('*-l16.glb'):
 scene=trimesh.load(file,force='scene')
 for geom in scene.geometry.values():
  v=geom.vertices
  points.append(v[::3])
verts=np.concatenate(points)
tree=cKDTree(verts[:,[0,2]])
print('surface vertices',len(verts),flush=True)
allowed={'primary','secondary','tertiary','residential','living_street','unclassified','service'}
routes=[]
for way in root.findall('way'):
 tags={t.attrib['k']:t.attrib['v'] for t in way.findall('tag')}
 if tags.get('highway') not in allowed or tags.get('area')=='yes':continue
 refs=[n.attrib['ref'] for n in way.findall('nd')]
 raw=[]
 for ref in refs:
  if ref not in nodes:continue
  e,n=transform.transform(*nodes[ref]);x=e-25490000-7335;z=-(n-6668000-5059)
  if -730<x<650 and -720<z<740:raw.append((x,z))
 if len(raw)<2:continue
 length=sum(math.dist(a,b) for a,b in zip(raw,raw[1:]))
 if length<45:continue
 path=[]
 for a,b in zip(raw,raw[1:]):
  segment=math.dist(a,b)
  for i in range(max(1,math.ceil(segment/18))):
   t=i/max(1,math.ceil(segment/18));path.append((a[0]*(1-t)+b[0]*t,a[1]*(1-t)+b[1]*t))
 path.append(raw[-1]);road=[]
 for x,z in path:
  dist,idx=tree.query([x,z]);y=float(verts[idx,1]) if dist<14 else 15
  road.append([round(x,2),round(y+1.2,2),round(z,2)])
 routes.append({'name':tags.get('name','street'),'speed':12 if tags['highway'] in {'residential','living_street','service'} else 16,'points':road})
print('routes',len(routes),'route points',sum(len(r['points']) for r in routes),flush=True)
(OUT/'traffic.json').write_text(json.dumps({'attribution':'© OpenStreetMap contributors, ODbL','routes':routes},separators=(',',':')))
