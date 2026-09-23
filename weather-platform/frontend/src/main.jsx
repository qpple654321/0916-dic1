import React,{useEffect,useMemo,useState}from"react";import{createRoot}from"react-dom/client";import{MapContainer,TileLayer,CircleMarker,Popup}from"react-leaflet";import"leaflet/dist/leaflet.css";import"./style.css";
const API=import.meta.env.VITE_API_BASE_URL||"http://localhost:8000";
const color=t=>t<15?"#2563eb":t<20?"#16a34a":t<25?"#eab308":t<30?"#f97316":t<35?"#ef4444":"#7f1d1d";
function App(){const[s,setS]=useState([]),[county,setCounty]=useState("全部"),[min,setMin]=useState(""),[max,setMax]=useState(""),[loading,setLoading]=useState(true);
const load=()=>{setLoading(true);fetch(API+"/api/temperature/latest").then(r=>r.json()).then(x=>setS(x.stations||[])).catch(()=>{}).finally(()=>setLoading(false))};
useEffect(()=>{load();const id=setInterval(load,300000);return()=>clearInterval(id)},[]);
const counties=useMemo(()=>["全部",...new Set(s.map(x=>x.county).filter(Boolean))],[s]);
const shown=s.filter(x=>(county==="全部"||x.county===county)&&(min===""||x.temperature>=Number(min))&&(max===""||x.temperature<=Number(max)));
return <main><header><div><h1>🌤 CWA Taiwan Weather Map</h1><p>中央氣象署即時氣象觀測平台</p></div><button onClick={load}>{loading?"更新中…":"↻ Refresh"}</button></header>
<section className="toolbar"><select value={county}onChange={e=>setCounty(e.target.value)}>{counties.map(x=><option key={x}>{x}</option>)}</select><input type="number"placeholder="最低 °C"value={min}onChange={e=>setMin(e.target.value)}/><input type="number"placeholder="最高 °C"value={max}onChange={e=>setMax(e.target.value)}/><span>顯示 {shown.length} / {s.length} 測站</span></section>
<div className="map"><MapContainer center={[23.7,120.9]}zoom={7}scrollWheelZoom><TileLayer attribution="&copy; OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"/>{shown.map(x=><CircleMarker key={x.station_id} center={[x.latitude,x.longitude]} radius={8} pathOptions={{color:color(x.temperature),fillColor:color(x.temperature),fillOpacity:.85}}><Popup><strong>{x.station_name||x.station_id}</strong><br/>🌡 {x.temperature.toFixed(1)} °C<br/>{x.county||""}<br/><small>{x.observation_time||""}</small></Popup></CircleMarker>)}</MapContainer></div>
<footer><span>資料：CWA O-A0001-001</span><span>每 5 分鐘自動更新</span></footer></main>}
createRoot(document.getElementById("root")).render(<App/>);