"""Build local gameplay roads and approximate building collision from public OSM XML.

Fetch the four central Lyon map squares from OpenStreetMap's map API into
/tmp/lyon-{sw,nw,se,ne}.xml before running this script. The photomesh remains
streamed from Métropole de Lyon; these small files contain no imagery.
"""
import json
import math
import struct
import xml.etree.ElementTree as ET
from pathlib import Path

ORIGIN_LAT=45.7578
ORIGIN_LON=4.8320
OUT=Path('public/assets/city/lyon')
OUT.mkdir(parents=True,exist_ok=True)

def local(lon,lat):
    return (-(lon-ORIGIN_LON)*111320*math.cos(math.radians(ORIGIN_LAT)),(lat-ORIGIN_LAT)*111320)

nodes={}
ways={}
for suffix in ('sw','nw','se','ne'):
    root=ET.parse(f'/tmp/lyon-{suffix}.xml').getroot()
    for item in root.findall('node'):
        nodes[item.attrib['id']]=local(float(item.attrib['lon']),float(item.attrib['lat']))
    for item in root.findall('way'):
        ways[item.attrib['id']]=item

allowed={'primary','secondary','tertiary','residential','living_street','unclassified','service'}
routes=[]
buildings=[]
for way in ways.values():
    tags={t.attrib['k']:t.attrib['v'] for t in way.findall('tag')}
    points=[nodes[r.attrib['ref']] for r in way.findall('nd') if r.attrib['ref'] in nodes]
    if len(points)<2:continue
    if tags.get('highway') in allowed and tags.get('area')!='yes':
        length=sum(math.dist(a,b) for a,b in zip(points,points[1:]))
        if length<45:continue
        route=[]
        for a,b in zip(points,points[1:]):
            count=max(1,math.ceil(math.dist(a,b)/18))
            for i in range(count):
                t=i/count
                route.append([round(a[0]*(1-t)+b[0]*t,2),1.4,round(a[1]*(1-t)+b[1]*t,2)])
        route.append([round(points[-1][0],2),1.4,round(points[-1][1],2)])
        routes.append({'name':tags.get('name','street'),'speed':9 if tags['highway'] in {'residential','living_street','service'} else 13,'points':route})
    if 'building' in tags and len(points)>=4 and points[0]==points[-1]:
        def metres(value):
            try:return float(value.replace('m','').replace(',','.').strip())
            except (ValueError,AttributeError):return None
        height=metres(tags.get('height')) or (metres(tags.get('building:levels')) or 5)*3.1
        buildings.append((points,min(65,max(5,height))))

(OUT/'traffic.json').write_text(json.dumps({'attribution':'© OpenStreetMap contributors, ODbL','routes':routes},separators=(',',':')))
# Keep individual footprints for structural damage. The coarse height raster
# cannot distinguish neighboring buildings that touch in a dense city block.
(OUT/'buildings.json').write_text(json.dumps({'attribution':'© OpenStreetMap contributors, ODbL','buildings':[
    [round(height,1),[[round(x,1),round(z,1)] for x,z in polygon[:-1]]]
    for polygon,height in buildings
]},separators=(',',':')))

def within(x,z,polygon):
    inside=False
    previous=polygon[-1]
    for current in polygon:
        x1,z1=previous;x2,z2=current
        if (z1>z)!=(z2>z) and x<(x2-x1)*(z-z1)/(z2-z1)+x1:inside=not inside
        previous=current
    return inside

step=5
start=-1150
size=461
heights=[0]*(size*size)
for polygon,height in buildings:
    xs=[p[0] for p in polygon];zs=[p[1] for p in polygon]
    ix0=max(0,int((min(xs)-start)/step)-1);ix1=min(size-1,int((max(xs)-start)/step)+1)
    iz0=max(0,int((min(zs)-start)/step)-1);iz1=min(size-1,int((max(zs)-start)/step)+1)
    if ix1<ix0 or iz1<iz0:continue
    for iz in range(iz0,iz1+1):
        for ix in range(ix0,ix1+1):
            if within(start+ix*step,start+iz*step,polygon):
                index=iz*size+ix
                heights[index]=max(heights[index],round(height*10))

(OUT/'collision.json').write_text(json.dumps({'x':start,'z':start,'step':step,'width':size,'depth':size,'source':'OpenStreetMap building footprints; approximate heights'}))
(OUT/'collision.bin').write_bytes(struct.pack('<'+'h'*len(heights),*heights))
print(f'{len(routes)} road routes, {len(buildings)} building footprints, {size}x{size} collision cells')
