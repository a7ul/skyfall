"""Ensure the Manhattan skyline includes all tall buildings from NYC's footprint layer."""
import json,urllib.parse,urllib.request,math,pathlib
p=pathlib.Path('public/assets/new-york-buildings.json');d=json.loads(p.read_text());f=d['features']
lat,lon=d['center'];dx=111412.84*math.cos(math.radians(lat))-93.5*math.cos(3*math.radians(lat));dz=111132.92-559.82*math.cos(2*math.radians(lat))
base='https://services2.arcgis.com/IsDCghZ73NgoYoz5/ArcGIS/rest/services/NYC_Building_Footprint/FeatureServer/0/query'
q={'where':'HEIGHTROOF>100','geometry':f'{lon-7000/dx},{lat-7000/dz},{lon+7000/dx},{lat+7000/dz}','geometryType':'esriGeometryEnvelope','inSR':'4326','outSR':'4326','outFields':'HEIGHTROOF,NAME','orderByFields':'FID ASC','f':'geoJSON','resultRecordCount':2000}
def key(g):return tuple(g['points'][0]),g['height']
seen={key(g) for g in f}
for offset in range(0,10000,2000):
 q['resultOffset']=offset
 with urllib.request.urlopen(base+'?'+urllib.parse.urlencode(q),timeout=60) as r:batch=json.load(r)['features']
 for item in batch:
  geo=item['geometry'];poly=geo['coordinates'][0] if geo['type']=='MultiPolygon' else geo['coordinates'];ring=poly[0]
  if len(ring)<4 or len(ring)>90:continue
  pts=[[round((x-lon)*dx,1),round(-(y-lat)*dz,1)] for x,y in ring]
  if pts[0]!=pts[-1]:pts.append(pts[0])
  cx=sum(pt[0] for pt in pts[:-1])/(len(pts)-1);cz=sum(pt[1] for pt in pts[:-1])/(len(pts)-1)
  if abs(cx)>7000 or abs(cz)>7000:continue
  h=round(float(item['properties']['HEIGHTROOF'])*.3048,1)
  g={'type':'building','points':pts,'height':h,'name':(item['properties'].get('NAME') or '').strip()}
  if key(g) not in seen:f.append(g);seen.add(key(g))
 print('tower page',offset//2000+1,'total',len(f),flush=True)
 if len(batch)<2000:break
# Favor measured taller buildings, while keeping low-rise city fabric at a bounded vertex count.
if len(f)>23000:
 tall=[g for g in f if g['height']>30.48]
 low=[g for g in f if g['height']<=30.48]
 low.sort(key=lambda g:sum(pt[0]**2+pt[1]**2 for pt in g['points'])/len(g['points']))
 f=tall+low[:23000-len(tall)]
d['features']=f;p.write_text(json.dumps(d,separators=(',',':')))
print('final',len(f),'height max',max(g['height'] for g in f))
