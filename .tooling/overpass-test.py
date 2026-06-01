import json, time, math, urllib.request, urllib.parse

UA = "seantylerlee-permit-tool/1.0"
EPS = ["https://overpass-api.de/api/interpreter",
       "https://overpass.kumi.systems/api/interpreter",
       "https://overpass.openstreetmap.ru/cgi/interpreter"]

def overpass(q):
    last = None
    for attempt in range(6):
        ep = EPS[attempt % len(EPS)]
        try:
            data = urllib.parse.urlencode({"data": q}).encode()
            req = urllib.request.Request(ep, data=data,
                headers={"User-Agent": UA, "Accept": "application/json"})
            with urllib.request.urlopen(req, timeout=90) as r:
                return json.load(r)
        except Exception as e:
            last = e
            time.sleep(4 + attempt * 4)
    raise last

TXBB = (25.8, -106.7, 36.6, -93.5)

# permit token -> OSM ref candidates (regex bodies, escaped spaces ok)
def ref_candidates(tok):
    m = tok.split()
    kind, num = m[0].upper(), (m[1] if len(m) > 1 else "")
    numd = "".join(ch for ch in num if ch.isdigit())
    suf = "".join(ch for ch in num if ch.isalpha())
    out = []
    if kind in ("IH", "I", "BI"):
        out = [f"I {numd}"]
    elif kind == "US":
        out = [f"US {numd}"]
    elif kind in ("SH", "TX"):
        out = [f"TX {numd}"]
    elif kind == "FM":
        out = [f"FM {numd}", f"RM {numd}"]
    elif kind == "RM":
        out = [f"RM {numd}", f"FM {numd}"]
    elif kind in ("LOOP", "SL"):
        out = [f"Loop {numd}"]
    elif kind in ("SS", "SP", "SPUR"):
        out = [f"Spur {numd}"]
    elif kind in ("BU", "BUS"):
        out = [f"US {numd} Business", f"Bus US {numd}", f"US {numd}"]
    elif kind == "CR":
        out = [f"CR {numd}"]
    else:
        out = [tok]
    return out

CACHE = {}

def is_interstate(tok):
    return tok.split()[0].upper() in ("IH", "I", "BI")

def fetch_geom(tok, bbox):
    if tok in CACHE:
        return CACHE[tok]
    s, w, n, e = bbox
    cands = ref_candidates(tok)
    union = "".join(
        f'way["ref"~"(^|;){re}(;|$)"]["highway"]({s},{w},{n},{e});' for re in cands
    )
    q = f"[out:json][timeout:80];({union});out geom;"
    d = overpass(q)
    out = []
    for el in d.get("elements", []):
        g = el.get("geometry")
        if g:
            out.append([(p["lat"], p["lon"]) for p in g])
    CACHE[tok] = out
    time.sleep(2)
    return out

def bounds(lines, pad=0.0):
    ys = [p[0] for l in lines for p in l]
    xs = [p[1] for l in lines for p in l]
    return (min(ys)-pad, min(xs)-pad, max(ys)+pad, max(xs)+pad)

def centroid(lines):
    ys = [p[0] for l in lines for p in l]
    xs = [p[1] for l in lines for p in l]
    return (sum(ys)/len(ys), sum(xs)/len(xs))

def hav(a, b):
    R = 3958.8
    dy = math.radians(b[0]-a[0]); dx = math.radians(b[1]-a[1])
    la1 = math.radians(a[0]); la2 = math.radians(b[0])
    h = math.sin(dy/2)**2 + math.cos(la1)*math.cos(la2)*math.sin(dx/2)**2
    return 2*R*math.asin(math.sqrt(h))

def seg_x(p1, p2, p3, p4):
    (y1, x1), (y2, x2) = p1, p2
    (y3, x3), (y4, x4) = p3, p4
    d = (x2-x1)*(y4-y3) - (y2-y1)*(x4-x3)
    if abs(d) < 1e-12:
        return None
    t = ((x3-x1)*(y4-y3) - (y3-y1)*(x4-x3)) / d
    u = ((x3-x1)*(y2-y1) - (y3-y1)*(x2-x1)) / d
    if 0 <= t <= 1 and 0 <= u <= 1:
        return (y1+t*(y2-y1), x1+t*(x2-x1))
    return None

def bbox_overlap(a, b, m=0.03):
    return not (a[2] < b[0]-m or a[0] > b[2]+m or a[3] < b[1]-m or a[1] > b[3]+m)

def crossings(A, B, near):
    pts = []
    # spatial prefilter: only segments near `near` (within ~0.6 deg) when near given
    for la in A:
        for i in range(len(la)-1):
            sa = (min(la[i][0], la[i+1][0]), min(la[i][1], la[i+1][1]),
                  max(la[i][0], la[i+1][0]), max(la[i][1], la[i+1][1]))
            for lb in B:
                for j in range(len(lb)-1):
                    sb = (min(lb[j][0], lb[j+1][0]), min(lb[j][1], lb[j+1][1]),
                          max(lb[j][0], lb[j+1][0]), max(lb[j][1], lb[j+1][1]))
                    if not bbox_overlap(sa, sb):
                        continue
                    p = seg_x(la[i], la[i+1], lb[j], lb[j+1])
                    if p:
                        pts.append(p)
    return pts

def nearest_approach(A, B, near):
    # prefilter points to a window around `near` to keep it cheap
    def win(lines):
        if not near:
            return [p for l in lines for p in l]
        return [p for l in lines for p in l if abs(p[0]-near[0]) < 0.7 and abs(p[1]-near[1]) < 0.7]
    pa = win(A); pb = win(B)
    if not pa or not pb:
        pa = [p for l in A for p in l]; pb = [p for l in B for p in l]
    best = None; bd = 1e9
    for p in pa:
        for q in pb:
            d = hav(p, q)
            if d < bd:
                bd = d; best = ((p[0]+q[0])/2, (p[1]+q[1])/2)
    return best, bd

def resolve(tokA, tokB, prev):
    A = CACHE[tokA]; B = CACHE[tokB]
    if not A or not B:
        return None
    near = prev
    xs = crossings(A, B, near)
    if xs:
        if prev:
            xs.sort(key=lambda p: hav(p, prev))
        return xs[0]
    pt, gap = nearest_approach(A, B, near)
    if pt and gap < 1.5:
        return pt
    return None

def bearing(a, b):
    y = math.sin(math.radians(b[1]-a[1])) * math.cos(math.radians(b[0]))
    x = (math.cos(math.radians(a[0]))*math.sin(math.radians(b[0])) -
         math.sin(math.radians(a[0]))*math.cos(math.radians(b[0]))*math.cos(math.radians(b[1]-a[1])))
    return (math.degrees(math.atan2(y, x)) + 360) % 360

COMPASS = {"north":0,"northeast":45,"east":90,"southeast":135,"south":180,
           "southwest":225,"west":270,"northwest":315}

def offset_along(line_set, pt, compass, miles):
    """Walk `miles` from pt along the road whose direction best matches compass."""
    want = COMPASS.get(compass)
    if want is None or not line_set:
        return pt
    # flatten nearest line to pt
    bestline = None; bd = 1e9; bi = 0
    for l in line_set:
        for i, p in enumerate(l):
            d = hav(p, pt)
            if d < bd:
                bd = d; bestline = l; bi = i
    if not bestline:
        return pt
    def dist_ang(a, b):
        return min(abs(a-b), 360-abs(a-b))
    # try both directions along the line, pick the one matching compass
    best = pt
    for direction in (1, -1):
        acc = 0.0; cur = pt; idx = bi
        nxt = idx + direction
        if 0 <= nxt < len(bestline):
            brg = bearing(bestline[idx], bestline[nxt])
            if dist_ang(brg, want) > 70:
                continue
        while 0 <= idx+direction < len(bestline) and acc < miles:
            a = bestline[idx]; b = bestline[idx+direction]
            d = hav(a, b)
            if acc + d >= miles:
                frac = (miles-acc)/d if d > 0 else 0
                return (a[0]+frac*(b[0]-a[0]), a[1]+frac*(b[1]-a[1]))
            acc += d; idx += direction; cur = b
        best = cur
    return best

ROUTE = ["US 385","SH 115","LOOP 1910","SH 176","SH 137","IH 20","SH 171",
         "US 377","FM 314","FM 16","SH 110","SL 323","US 271","SS 156"]
SEGS = [
    ("Origin", "US 385", "SH 115"),
    ("Turn", "US 385", "LOOP 1910"),
    ("Turn", "LOOP 1910", "SH 115"),
    ("Turn", "SH 115", "SH 176"),
    ("Turn", "SH 176", "SH 137"),
    ("Turn", "SH 137", "IH 20"),
    ("Turn", "IH 20", "SH 171"),
    ("Turn", "SH 171", "US 377"),
    ("Turn", "US 377", "IH 20"),
    ("Turn", "IH 20", "FM 314"),
    ("Turn", "FM 314", "FM 16"),
    ("Turn", "FM 16", "SH 110"),
    ("Turn", "SH 110", "SL 323"),
    ("Turn", "SL 323", "US 271"),
    ("Turn", "US 271", "IH 20"),
    ("Destination", "IH 20", "SS 156"),
]

t0 = time.time()
print("Phase 1: fetch non-interstate geometry statewide...")
for tok in ROUTE:
    if is_interstate(tok):
        continue
    g = fetch_geom(tok, TXBB)
    print(f"  {tok}: {len(g)} ways, {sum(len(l) for l in g)} pts")

noninter = [CACHE[t] for t in ROUTE if not is_interstate(t) and CACHE.get(t)]
allpts = [l for g in noninter for l in g]
corr = bounds(allpts, pad=0.6)
print(f"corridor bbox: {corr}")

print("Phase 2: fetch interstate within corridor...")
for tok in ROUTE:
    if is_interstate(tok):
        g = fetch_geom(tok, corr)
        print(f"  {tok}: {len(g)} ways, {sum(len(l) for l in g)} pts")

print("\nPhase 3: resolve waypoints")
prev = None
results = []
for k, (label, a, b) in enumerate(SEGS):
    if prev is None:
        # origin: seed disambiguation by centroid of next road (b)
        seed = centroid(CACHE[b]) if CACHE.get(b) else None
        pt = resolve(a, b, seed)
    else:
        pt = resolve(a, b, prev)
    if pt and label == "Origin":
        pt = offset_along(CACHE[a], pt, "north", 1.9)
    if pt and label == "Destination":
        pt = offset_along(CACHE[a], pt, "southeast", 0.9)
    results.append((label, a, b, pt))
    if pt:
        prev = pt
    tag = f"{pt[0]:.5f},{pt[1]:.5f}" if pt else "UNRESOLVED"
    print(f"  {k:2d} [{label}] {a} & {b}: {tag}")

print(f"\nTotal time: {time.time()-t0:.1f}s")
