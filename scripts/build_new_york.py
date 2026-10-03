"""Bundle a Manhattan scene from NYC public orthophotos/building footprints and Mapzen terrain.

Run from repository root: python3 scripts/build_new_york.py
NYC map tiles are CC BY 4.0: https://gis.nyc.gov/tiles/
NYC building layer: https://services2.arcgis.com/IsDCghZ73NgoYoz5/ArcGIS/rest/services/NYC_Building_Footprint/FeatureServer/0
Mapzen Terrarium elevation: https://registry.opendata.aws/terrain-tiles/
"""
import concurrent.futures
import io
import json
import math
import pathlib
import struct
import urllib.parse
import urllib.request
from PIL import Image

OUT=pathlib.Path('public/assets');OUT.mkdir(exist_ok=True)
LAT,LON=40.752,-73.985
SIZE=32000; N=513
DEG_LAT=111132.92-559.82*math.cos(2*math.radians(LAT))
DEG_LON=111412.84*math.cos(math.radians(LAT))-93.5*math.cos(3*math.radians(LAT))
HEAD={'User-Agent':'SkyfallProtocol/0.3 (local WebGPU game; NYC open-data attribution)'}

def get(url,timeout=45):
    with urllib.request.urlopen(urllib.request.Request(url,headers=HEAD),timeout=timeout) as r:return r.read()
def tile(lon,lat,z):
    x=(lon+180)/360*2**z
    y=(1-math.asinh(math.tan(math.radians(lat)))/math.pi)/2*2**z
    return x,y
def local(lon,lat):return [round((lon-LON)*DEG_LON,1),round(-(lat-LAT)*DEG_LAT,1)]

# Elevation tiles are cached and shared by the entire 513x513 terrain grid.
cache={}
def elevation(lon,lat):
    tx,ty=tile(lon,lat,12);ix,iy=int(tx),int(ty)
    if (ix,iy) not in cache:
        url=f'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/12/{ix}/{iy}.png'
        cache[ix,iy]=Image.open(io.BytesIO(get(url))).convert('RGB')
        print('elevation tile',ix,iy,flush=True)
    r,g,b=cache[ix,iy].getpixel((min(255,int((tx-ix)*256)),min(255,int((ty-iy)*256))))
    return r*256+g+b/256-32768
values=[]
for row in range(N):
    z=(row/(N-1)-0.5)*SIZE;lat=LAT-z/DEG_LAT
    for col in range(N):
        x=(col/(N-1)-0.5)*SIZE;lon=LON+x/DEG_LON
        values.append(elevation(lon,lat))
(OUT/'new-york-elevation.bin').write_bytes(struct.pack('<%sf'%len(values),*values))
print('elevation range',min(values),max(values),flush=True)

# The compact orthophoto covers the main play area; the lower detail terrain continues to the horizon.
HALF=7000; ZOOM=15
west=LON-HALF/DEG_LON;east=LON+HALF/DEG_LON
north=LAT+HALF/DEG_LAT;south=LAT-HALF/DEG_LAT
left,top=tile(west,north,ZOOM);right,bottom=tile(east,south,ZOOM)
ix0,iy0=math.floor(left),math.floor(top);ix1,iy1=math.floor(right),math.floor(bottom)
mosaic=Image.new('RGB',((ix1-ix0+1)*256,(iy1-iy0+1)*256),(93,101,100))
base='https://tiles.arcgis.com/tiles/yG5s3afENB5iO9fj/arcgis/rest/services/NYC_Orthos_2024/MapServer/tile'
def fetch_tile(pair):
    x,y=pair
    try:return x,y,Image.open(io.BytesIO(get(f'{base}/{ZOOM}/{y}/{x}'))).convert('RGB')
    except Exception as e:
        print('missing ortho',x,y,str(e)[:100],flush=True);return x,y,None
pairs=[(x,y) for y in range(iy0,iy1+1) for x in range(ix0,ix1+1)]
with concurrent.futures.ThreadPoolExecutor(max_workers=12) as pool:
    for x,y,img in pool.map(fetch_tile,pairs):
        if img:mosaic.paste(img,((x-ix0)*256,(y-iy0)*256))
print('ortho tiles',len(pairs),flush=True)
crop=mosaic.crop(((left-ix0)*256,(top-iy0)*256,(right-ix0)*256,(bottom-iy0)*256)).resize((4096,4096),Image.Resampling.LANCZOS).convert('RGBA')
# NYC tiles are white beyond the city boundary. Cut those pixels out so the
# broader terrain remains visible; an opaque white square looks like snow.
pixels=crop.load()
for py in range(crop.height):
    for px in range(crop.width):
        r,g,b,a=pixels[px,py]
        if r>246 and g>246 and b>246:pixels[px,py]=(0,0,0,0)
crop.save(OUT/'new-york-ortho.webp','WEBP',quality=84,method=6)

# NYC's own footprint layer has measured roof height, in feet. Pull a contiguous area,
# then retain a bounded subset so the city renders in one mesh at flight speed.
base='https://services2.arcgis.com/IsDCghZ73NgoYoz5/ArcGIS/rest/services/NYC_Building_Footprint/FeatureServer/0/query'
params={'where':'1=1','geometry':f'{west},{south},{east},{north}','geometryType':'esriGeometryEnvelope','inSR':'4326','outSR':'4326','outFields':'HEIGHTROOF,NAME,FEAT_CODE','orderByFields':'FID ASC','f':'geoJSON','resultRecordCount':2000}
features=[]
for offset in range(0,50000,2000):
    params['resultOffset']=offset
    batch=json.loads(get(base+'?'+urllib.parse.urlencode(params),timeout=90))['features']
    if not batch:break
    for f in batch:
        geom=f['geometry'];poly=geom['coordinates']
        if geom['type']=='MultiPolygon':poly=poly[0]
        ring=poly[0]
        if len(ring)<4 or len(ring)>90:continue
        pts=[local(lon,lat) for lon,lat in ring]
        if pts[0]!=pts[-1]:pts.append(pts[0])
        cx=sum(p[0] for p in pts[:-1])/(len(pts)-1);cz=sum(p[1] for p in pts[:-1])/(len(pts)-1)
        if abs(cx)>HALF or abs(cz)>HALF:continue
        area=abs(sum(pts[i][0]*pts[i+1][1]-pts[i+1][0]*pts[i][1] for i in range(len(pts)-1)))*.5
        if area<30:continue
        h=f['properties'].get('HEIGHTROOF')
        h=round(float(h)*.3048,1) if h is not None and float(h)>0 else 10
        # Keep measured towers and nearby low rises; tiny distant sheds add little from the air.
        score=area**.5*(1+min(h,300)/70)/(1+(cx/6200)**2+(cz/6200)**2)
        features.append((score,{'type':'building','points':pts,'height':h,'name':(f['properties'].get('NAME') or '').strip()}))
    print('building page',offset//2000+1,'count',len(features),flush=True)
    if len(batch)<2000:break
features.sort(key=lambda x:x[0],reverse=True)
keep=[f for _,f in features[:19000]]
(OUT/'new-york-buildings.json').write_text(json.dumps({'center':[LAT,LON],'size':SIZE,'features':keep},separators=(',',':')))
print('saved buildings',len(keep),'orthophoto MB',round((OUT/'new-york-ortho.webp').stat().st_size/1e6,2),flush=True)
