import os,time
import httpx
from fastapi import FastAPI,HTTPException
from fastapi.middleware.cors import CORSMiddleware
app=FastAPI(title="CWA Taiwan Weather API")
app.add_middleware(CORSMiddleware,allow_origins=["*"],allow_methods=["*"],allow_headers=["*"])
URL=os.getenv("CWA_DATA_URL","https://opendata.cwa.gov.tw/api/v1/rest/datastore/O-A0001-001");KEY=os.getenv("CWA_API_KEY","");TTL=int(os.getenv("CACHE_TTL_SECONDS","600"));cache={"at":0.0,"data":None}
async def fetch():
    if cache["data"] is not None and time.time()-cache["at"]<TTL:return cache["data"]
    if not KEY:raise HTTPException(500,"CWA_API_KEY is not configured")
    async with httpx.AsyncClient(timeout=20) as c:
        r=await c.get(URL,params={"Authorization":KEY,"format":"JSON"});r.raise_for_status();data=r.json()
    cache.update(at=time.time(),data=data);return data
def num(v):
    try:return float(v)
    except(TypeError,ValueError):return None
def num(v):
    try:return float(v)
    except (TypeError,ValueError):return None

def normalize(raw):
    out=[]
    for s in (raw.get("records") or {}).get("Station") or []:
        g=s.get("GeoInfo") or {};cs=g.get("Coordinates") or [];lat=lon=None
        if cs:lat=num(cs[0].get("StationLatitude"));lon=num(cs[0].get("StationLongitude"))
        w=s.get("WeatherElement") or {};temp=num(w.get("AirTemperature"))
        if temp is None or lat is None or lon is None:continue
        out.append({"station_id":s.get("StationId"),"station_name":s.get("StationName"),"county":g.get("CountyName"),"town":g.get("TownName"),"latitude":lat,"longitude":lon,"temperature":temp,"humidity":num(w.get("RelativeHumidity")),"wind_speed":num(w.get("WindSpeed")),"wind_direction":num(w.get("WindDirection")),"pressure":num(w.get("AirPressure")),"rain":num(w.get("Precipitation")),"observation_time":s.get("ObsTime")})
    return out
@app.get("/api/health")
async def health():return {"status":"ok"}
@app.get("/api/temperature/latest")
async def latest():return {"stations":normalize(await fetch())}
@app.get("/api/temperature/geojson")
async def geojson():
    return {"type":"FeatureCollection","features":[{"type":"Feature","geometry":{"type":"Point","coordinates":[s["longitude"],s["latitude"]]},"properties":s} for s in normalize(await fetch())]}
@app.get("/api/temperature/stations/{station_id}")
async def station(station_id:str):
    for s in normalize(await fetch()):
        if s["station_id"]==station_id:return s
    raise HTTPException(404,"station not found")
