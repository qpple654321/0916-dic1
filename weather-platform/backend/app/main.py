import os,time
from typing import Any
import httpx
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

app=FastAPI(title="CWA Taiwan Weather API")
app.add_middleware(CORSMiddleware,allow_origins=["*"],allow_methods=["*"],allow_headers=["*"])
URL=os.getenv("CWA_DATA_URL","https://opendata.cwa.gov.tw/api/v1/rest/datastore/O-A0001-001")
KEY=os.getenv("CWA_API_KEY","")
TTL=int(os.getenv("CACHE_TTL_SECONDS","600"))
cache={"at":0.0,"data":None}

async def fetch():
    if cache["data"] is not None and time.time()-cache["at"]<TTL:return cache["data"]
    if not KEY: raise HTTPException(500,"CWA_API_KEY is not configured")
    async with httpx.AsyncClient(timeout=20) as client:
        r=await client.get(URL,params={"Authorization":KEY,"format":"JSON"})
        r.raise_for_status()
        data=r.json()
    cache.update(at=time.time(),data=data)
    return data

def normalize(raw):
    records=(raw.get("records") or {}).get("Station") or []
    result=[]
    for s in records:
        geo=s.get("GeoInfo") or {}
        coords=geo.get("Coordinates") or []
        lat=lon=None
        if coords:
            c=coords[0]
            lat=c.get("StationLatitude"); lon=c.get("StationLongitude")
        w=s.get("WeatherElement") or {}
        try:
            temp=float(w.get("AirTemperature"))
            lat=float(lat); lon=float(lon)
        except (TypeError,ValueError):
            continue
        result.append({"station_id":s.get("StationId"),"station_name":s.get("StationName"),
                       "county":geo.get("CountyName"),"latitude":lat,"longitude":lon,
                       "temperature":temp,"observation_time":s.get("ObsTime")})
    return result

@app.get("/api/health")
async def health(): return {"status":"ok"}

@app.get("/api/temperature/latest")
async def latest(): return {"stations":normalize(await fetch())}

@app.get("/api/temperature/geojson")
async def geojson():
    features=[]
    for s in normalize(await fetch()):
        features.append({"type":"Feature","geometry":{"type":"Point","coordinates":[s["longitude"],s["latitude"]]},
                         "properties":{k:s[k] for k in ("station_id","station_name","county","temperature","observation_time")}})
    return {"type":"FeatureCollection","features":features}

@app.get("/api/temperature/stations/{station_id}")
async def station(station_id:str):
    for s in normalize(await fetch()):
        if s["station_id"]==station_id:return s
    raise HTTPException(404,"station not found")
