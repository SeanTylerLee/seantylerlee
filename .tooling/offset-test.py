import json, sys, math, urllib.request, urllib.parse

EPS = ["https://overpass.kumi.systems/api/interpreter",
       "https://overpass.openstreetmap.ru/cgi/interpreter",
       "https://overpass-api.de/api/interpreter"]

def overpass(q):
    last = None
    for ep in EPS:
        try:
            data = urllib.parse.urlencode({"data": q}).encode()
            req = urllib.request.Request(ep, data=data,
                headers={"User-Agent": "permit-tool/1.0", "Accept": "application/json"})
            with urllib.request.urlopen(req, timeout=60) as r:
                print("ok via", ep, flush=True)
                return json.load(r)
        except Exception as e:
            print("fail", ep, e, flush=True); last = e
    raise last

def geom(ref, bbox):
    s,w,n,e = bbox
    q = f'[out:json][timeout:60];way["ref"~"(^|;){ref}(;|$)"]["highway"]({s},{w},{n},{e});out geom;'
    d = overpass(q)
    return [[(p["lat"],p["lon"]) for p in el["geometry"]] for el in d.get("elements",[]) if el.get("geometry")]

def hav(a,b):
    R=3958.8; dy=math.radians(b[0]-a[0]); dx=math.radians(b[1]-a[1])
    h=math.sin(dy/2)**2+math.cos(math.radians(a[0]))*math.cos(math.radians(b[0]))*math.sin(dx/2)**2
    return 2*R*math.asin(math.sqrt(h))

def bearing(a,b):
    y=math.sin(math.radians(b[1]-a[1]))*math.cos(math.radians(b[0]))
    x=(math.cos(math.radians(a[0]))*math.sin(math.radians(b[0]))-
       math.sin(math.radians(a[0]))*math.cos(math.radians(b[0]))*math.cos(math.radians(b[1]-a[1])))
    return (math.degrees(math.atan2(y,x))+360)%360

COMPASS={"north":0,"northeast":45,"east":90,"southeast":135,"south":180,"southwest":225,"west":270,"northwest":315}

def offset_along(lines, pt, compass, miles):
    want=COMPASS[compass]
    best=None; bd=1e9; bl=None; bi=0
    for l in lines:
        for i,p in enumerate(l):
            d=hav(p,pt)
            if d<bd: bd=d; bl=l; bi=i
    def da(a,b): return min(abs(a-b),360-abs(a-b))
    for direction in (1,-1):
        nxt=bi+direction
        if 0<=nxt<len(bl):
            if da(bearing(bl[bi],bl[nxt]),want)>70: continue
        acc=0.0; idx=bi
        while 0<=idx+direction<len(bl) and acc<miles:
            a=bl[idx]; b=bl[idx+direction]; d=hav(a,b)
            if acc+d>=miles:
                f=(miles-acc)/d if d>0 else 0
                return (a[0]+f*(b[0]-a[0]), a[1]+f*(b[1]-a[1]))
            acc+=d; idx+=direction
    return pt

# Andrews intersection US385 x TX115
inter=(32.31874,-102.54656)
g=geom("US 385",(32.0,-103.0,32.6,-102.0))
print("US 385 ways:", len(g), flush=True)
p=offset_along(g, inter, "north", 1.9)
print(f"start (1.9mi N of US385&SH115) = {p[0]:.5f},{p[1]:.5f}", flush=True)
print(f"  check dist from intersection = {hav(inter,p):.2f} mi (expect ~1.9)", flush=True)
print(f"  delta lat (should be +, going north) = {p[0]-inter[0]:+.4f}", flush=True)
