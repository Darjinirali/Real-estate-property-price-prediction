import { useState } from "react";
import {
  AreaChart, Area, BarChart, Bar, RadarChart, Radar,
  PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell
} from "recharts";

// ── Exact values from notebook ─────────────────────────────────
const CITIES = {
  NYC:     { lat: 40.7128, lon: -74.0060,   label: "New York",    flag: "🗽" },
  SF:      { lat: 37.7749, lon: -122.4194,  label: "San Francisco",flag: "🌉" },
  LA:      { lat: 34.0522, lon: -118.2437,  label: "Los Angeles", flag: "🌴" },
  DC:      { lat: 38.9072, lon: -77.0369,   label: "Washington DC",flag: "🏛" },
  Chicago: { lat: 41.8781, lon: -87.6298,   label: "Chicago",     flag: "🌬" },
  Boston:  { lat: 42.3601, lon: -71.0589,   label: "Boston",      flag: "🦞" },
};

// Exact from notebook categorical_cols
const ROOM_TYPES   = ["Entire home/apt", "Private room", "Shared room"];
const PROP_TYPES   = ["Apartment","House","Condo","Loft","Villa","Studio","Townhouse","Guest suite","Bungalow","Cabin"];
const BED_TYPES    = ["Real Bed","Pull-out Sofa","Futon","Couch","Airbed"];
const CANCEL_POLS  = ["flexible","moderate","strict","super_strict_30","super_strict_60"];

const API = "http://localhost:5000";

// ── Demo predict (matches notebook feature logic) ───────────────
function demoPredict(f) {
  const cityBase = { NYC:195, SF:220, LA:155, DC:165, Chicago:125, Boston:170 };
  const roomMult = { "Entire home/apt":1.0, "Private room":0.52, "Shared room":0.28 };
  const base  = cityBase[f.city] || 170;
  const rm    = roomMult[f.room_type] || 1.0;
  const boost = (1 + (f.accommodates-2)*0.09) * (1 + (f.bedrooms-1)*0.07)
              * (1 + (f.bathrooms-1)*0.06)
              * (f.review_scores_rating ? 1+(f.review_scores_rating-90)*0.003 : 1)
              * (f.cleaning_fee === "True" ? 1.06 : 1)
              * (f.host_identity_verified === "t" ? 1.04 : 1);
  const perNight = Math.max(20, Math.round(base * rm * boost));
  const total    = perNight * f.duration_days;
  return {
    per_night_usd: perNight, total_usd: total,
    per_night_local: perNight, total_local: total,
    currency: { symbol:"$", code:"USD", rate:1 },
    duration_days: f.duration_days, city: f.city,
    log_price: +(Math.log(perNight)).toFixed(4),
    model_r2: 0.72,
    confidence_low:  Math.round(perNight * 0.83),
    confidence_high: Math.round(perNight * 1.17),
  };
}

// ── Toggle switch ───────────────────────────────────────────────
function Toggle({ checked, onChange, label }) {
  return (
    <label style={{ display:"flex", alignItems:"center", gap:8, cursor:"pointer" }}>
      <div onClick={() => onChange(!checked)} style={{
        width:36, height:20, borderRadius:10, position:"relative",
        background: checked ? "#ff385c" : "rgba(255,255,255,0.12)",
        transition:"background .2s", cursor:"pointer", flexShrink:0,
      }}>
        <div style={{
          position:"absolute", top:2, left: checked ? 18 : 2,
          width:16, height:16, borderRadius:"50%", background:"#fff",
          transition:"left .2s", boxShadow:"0 1px 3px rgba(0,0,0,.3)"
        }}/>
      </div>
      <span style={{ fontSize:12, color:"#94a3b8" }}>{label}</span>
    </label>
  );
}

// ── Stepper ─────────────────────────────────────────────────────
function Stepper({ label, icon, value, min, max, step=1, onChange }) {
  return (
    <div>
      <div style={{ fontSize:10, fontWeight:700, color:"#475569", textTransform:"uppercase", letterSpacing:"0.8px", marginBottom:5 }}>{icon} {label}</div>
      <div style={{ display:"flex", alignItems:"center", background:"rgba(255,255,255,0.05)", border:"1px solid rgba(255,255,255,0.09)", borderRadius:10, overflow:"hidden" }}>
        <button onClick={() => onChange(Math.max(min, parseFloat((value-step).toFixed(1))))}
          style={{ padding:"8px 13px", background:"transparent", border:"none", color:"#ff385c", fontSize:18, fontWeight:700, cursor:"pointer", lineHeight:1 }}>−</button>
        <span style={{ flex:1, textAlign:"center", fontSize:15, fontWeight:700, color:"#e2e8f0" }}>{value}</span>
        <button onClick={() => onChange(Math.min(max, parseFloat((value+step).toFixed(1))))}
          style={{ padding:"8px 13px", background:"transparent", border:"none", color:"#ff385c", fontSize:18, fontWeight:700, cursor:"pointer", lineHeight:1 }}>+</button>
      </div>
    </div>
  );
}

// ── Card ─────────────────────────────────────────────────────────
function Card({ children, style={}, accent=false }) {
  return (
    <div style={{
      background: accent ? "rgba(255,56,92,0.05)" : "rgba(255,255,255,0.03)",
      border: `1px solid ${accent ? "rgba(255,56,92,0.22)" : "rgba(255,255,255,0.07)"}`,
      borderRadius:16, backdropFilter:"blur(8px)",
      ...style
    }}>{children}</div>
  );
}

// ── Section heading ──────────────────────────────────────────────
function SH({ icon, label }) {
  return (
    <div style={{ fontSize:11, fontWeight:700, color:"#ff385c", textTransform:"uppercase", letterSpacing:"1px", marginBottom:13, display:"flex", alignItems:"center", gap:6 }}>
      <span>{icon}</span>{label}
    </div>
  );
}

// ── Main ─────────────────────────────────────────────────────────
export default function AirbnbPredictor() {
  const [tab,     setTab]     = useState("predict");
  const [result,  setResult]  = useState(null);
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState([]);
  const [mode,    setMode]    = useState("demo");
  const [animKey, setAnimKey] = useState(0);

  // Exact notebook columns
  const [form, setForm] = useState({
    city: "NYC",
    room_type: "Entire home/apt",
    property_type: "Apartment",
    bed_type: "Real Bed",
    cancellation_policy: "moderate",
    cleaning_fee: "True",
    instant_bookable: "f",
    host_has_profile_pic: "t",
    host_identity_verified: "t",
    accommodates: 2,
    bathrooms: 1,
    bedrooms: 1,
    beds: 1,
    number_of_reviews: 12,
    review_scores_rating: 92,
    duration_days: 3,
  });

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const predict = async () => {
    setLoading(true);
    setResult(null);
    try {
      let res;
      if (mode === "api") {
        const city = CITIES[form.city];
        const r = await fetch(`${API}/predict`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...form, latitude: city.lat, longitude: city.lon }),
        });
        res = await r.json();
      } else {
        await new Promise(r => setTimeout(r, 650));
        res = demoPredict(form);
      }
      setResult(res);
      setHistory(h => [{ ...res, inputs: { ...form }, ts: new Date().toLocaleTimeString() }, ...h.slice(0, 9)]);
      setAnimKey(k => k + 1);
    } catch (e) { alert("Error: " + e.message); }
    setLoading(false);
  };

  // Chart data
  const durationChart = result ? Array.from({ length: 14 }, (_, i) => ({
    d: `${i+1}D`, total: Math.round(result.per_night_usd * (i+1))
  })) : [];

  const radarData = [
    { a: "Space",    v: Math.min(100, form.accommodates * 13) },
    { a: "Comfort",  v: Math.min(100, form.bedrooms*26 + form.bathrooms*18) },
    { a: "Rating",   v: form.review_scores_rating || 80 },
    { a: "Bookings", v: Math.min(100, form.number_of_reviews*2) },
    { a: "Host",     v: form.host_identity_verified === "t" ? 88 : 50 },
    { a: "Value",    v: result ? Math.max(20, 98 - result.per_night_usd/4.5) : 55 },
  ];

  const histChart = [...history].reverse().map((h,i) => ({ n:`P${i+1}`, p: h.per_night_usd }));

  const inp = {
    width:"100%", background:"rgba(255,255,255,0.05)", border:"1px solid rgba(255,255,255,0.09)",
    borderRadius:10, padding:"9px 12px", color:"#e2e8f0", fontSize:13,
    fontFamily:"'DM Sans',sans-serif", outline:"none",
  };

  return (
    <div style={{ minHeight:"100vh", background:"#070b12", fontFamily:"'DM Sans',sans-serif", color:"#e2e8f0" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=Syne:wght@700;800&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}
        ::-webkit-scrollbar{width:3px}::-webkit-scrollbar-thumb{background:#ff385c;border-radius:2px}
        select option{background:#0d1520}
        @keyframes fadeUp{from{opacity:0;transform:translateY(16px) scale(.97)}to{opacity:1;transform:none}}
        .anim{animation:fadeUp .38s cubic-bezier(.34,1.5,.64,1)}
        @keyframes spin{to{transform:rotate(360deg)}}
        .spin{animation:spin .7s linear infinite;display:inline-block}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:.35}}.pulse{animation:pulse 1.3s infinite}
        .tab-btn{padding:8px 20px;border-radius:9px;border:1px solid rgba(255,255,255,.07);cursor:pointer;font-size:13px;font-weight:600;font-family:'DM Sans',sans-serif;transition:all .18s;letter-spacing:.2px}
        .tab-btn.on{background:#ff385c;border-color:#ff385c;color:#fff;box-shadow:0 4px 16px rgba(255,56,92,.3)}
        .tab-btn:not(.on){background:transparent;color:#64748b}
        .tab-btn:not(.on):hover{color:#ff385c;border-color:rgba(255,56,92,.3)}
        .srange{-webkit-appearance:none;width:100%;height:3px;border-radius:2px;background:rgba(255,255,255,.1);outline:none}
        .srange::-webkit-slider-thumb{-webkit-appearance:none;width:16px;height:16px;border-radius:50%;background:#ff385c;cursor:pointer;box-shadow:0 0 8px rgba(255,56,92,.5)}
        .pred-btn{width:100%;padding:13px;border-radius:12px;background:linear-gradient(135deg,#ff385c,#de1952);border:none;color:#fff;font-size:15px;font-weight:700;cursor:pointer;font-family:'DM Sans',sans-serif;box-shadow:0 5px 20px rgba(255,56,92,.35);transition:all .2s}
        .pred-btn:hover:not(:disabled){transform:translateY(-2px);box-shadow:0 9px 28px rgba(255,56,92,.45)}
        .pred-btn:disabled{opacity:.5;cursor:not-allowed;transform:none}
        .city-btn{padding:8px 6px;border-radius:9px;border:1px solid;cursor:pointer;font-size:12px;font-weight:700;font-family:'DM Sans',sans-serif;transition:all .15s;text-align:center}
      `}</style>

      {/* ── Header ── */}
      <div style={{ background:"rgba(255,255,255,.018)", borderBottom:"1px solid rgba(255,255,255,.06)", padding:"13px 28px", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
        <div style={{ display:"flex", alignItems:"center", gap:11 }}>
          <div style={{ width:36, height:36, borderRadius:10, background:"linear-gradient(135deg,#ff385c,#de1952)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:18, boxShadow:"0 4px 12px rgba(255,56,92,.4)" }}>🏠</div>
          <div>
            <div style={{ fontFamily:"'Syne',sans-serif", fontWeight:800, fontSize:18, color:"#fff", letterSpacing:-.3 }}>
              Airbnb <span style={{ color:"#ff385c" }}>PriceAI</span>
            </div>
            <div style={{ fontSize:10, color:"#334155", letterSpacing:"1px" }}>XGBOOST · R² {result ? (result.model_r2*100).toFixed(0) : "72"}%</div>
          </div>
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
          <span style={{ fontSize:11, color:"#334155" }}>Mode</span>
          {["demo","api"].map(m => (
            <button key={m} onClick={() => setMode(m)} style={{
              padding:"4px 13px", borderRadius:8, border:"1px solid",
              borderColor: mode===m ? "#ff385c" : "rgba(255,255,255,.07)",
              background: mode===m ? "rgba(255,56,92,.15)" : "transparent",
              color: mode===m ? "#ff385c" : "#475569",
              fontSize:11, fontWeight:700, cursor:"pointer", fontFamily:"'DM Sans',sans-serif"
            }}>{m === "demo" ? "Demo" : "Flask API"}</button>
          ))}
          {mode === "demo" && (
            <span style={{ fontSize:10, color:"#f59e0b", background:"rgba(245,158,11,.1)", padding:"3px 10px", borderRadius:20, border:"1px solid rgba(245,158,11,.18)", fontWeight:700 }}>⚡ DEMO</span>
          )}
        </div>
      </div>

      {/* ── Tabs ── */}
      <div style={{ padding:"14px 28px 0", display:"flex", gap:8 }}>
        {[["predict","🎯  Predict"],["analytics","📊  Analytics"],["history","🕐  History"]].map(([id,label]) => (
          <button key={id} className={`tab-btn ${tab===id?"on":""}`} onClick={() => setTab(id)}>{label}</button>
        ))}
      </div>

      <div style={{ padding:"18px 28px 48px" }}>

        {/* ═══════ PREDICT TAB ══════════════════════════════ */}
        {tab === "predict" && (
          <div style={{ display:"flex", flexDirection:"column", gap:14 }}>

            {/* Row 1 — Location | Property | Capacity */}
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:14 }}>

              {/* Location */}
              <Card style={{ padding:18 }}>
                <SH icon="📍" label="Location" />
                <div className="lbl" style={{ fontSize:10, color:"#475569", marginBottom:8, fontWeight:600, letterSpacing:".8px", textTransform:"uppercase" }}>Select City</div>
                <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:6, marginBottom:14 }}>
                  {Object.entries(CITIES).map(([key, c]) => (
                    <button key={key} className="city-btn" onClick={() => set("city", key)} style={{
                      borderColor: form.city===key ? "#ff385c" : "rgba(255,255,255,.08)",
                      background: form.city===key ? "rgba(255,56,92,.15)" : "rgba(255,255,255,.02)",
                      color: form.city===key ? "#ff385c" : "#64748b",
                    }}>
                      <div style={{ fontSize:16 }}>{c.flag}</div>
                      <div style={{ fontSize:11, fontWeight:700 }}>{key}</div>
                    </button>
                  ))}
                </div>
                <div style={{ background:"rgba(255,255,255,.025)", borderRadius:10, padding:"10px 12px", border:"1px solid rgba(255,255,255,.05)" }}>
                  <div style={{ fontSize:10, color:"#334155", marginBottom:3 }}>📍 Coordinates</div>
                  <div style={{ fontSize:11, color:"#64748b" }}>{CITIES[form.city].lat.toFixed(4)}°N, {Math.abs(CITIES[form.city].lon).toFixed(4)}°W</div>
                  <div style={{ fontSize:11, color:"#475569", marginTop:2 }}>{CITIES[form.city].label}</div>
                </div>
              </Card>

              {/* Property */}
              <Card style={{ padding:18 }}>
                <SH icon="🏡" label="Property" />
                <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                  {[
                    ["Room Type", "room_type", ROOM_TYPES],
                    ["Property Type", "property_type", PROP_TYPES],
                    ["Bed Type", "bed_type", BED_TYPES],
                    ["Cancellation", "cancellation_policy", CANCEL_POLS],
                  ].map(([label, key, opts]) => (
                    <div key={key}>
                      <div style={{ fontSize:10, color:"#475569", marginBottom:5, fontWeight:600, letterSpacing:".8px", textTransform:"uppercase" }}>{label}</div>
                      <select value={form[key]} onChange={e => set(key, e.target.value)} style={inp}>
                        {opts.map(o => <option key={o}>{o}</option>)}
                      </select>
                    </div>
                  ))}
                </div>
              </Card>

              {/* Capacity */}
              <Card style={{ padding:18 }}>
                <SH icon="🛏" label="Capacity" />
                <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                  <Stepper label="Guests"    icon="👥" value={form.accommodates}  min={1} max={16} onChange={v => set("accommodates", v)} />
                  <Stepper label="Bedrooms"  icon="🛏" value={form.bedrooms}      min={0} max={10} onChange={v => set("bedrooms", v)} />
                  <Stepper label="Bathrooms" icon="🚿" value={form.bathrooms}     min={0.5} max={8} step={0.5} onChange={v => set("bathrooms", v)} />
                  <Stepper label="Beds"      icon="🛌" value={form.beds}          min={1} max={16} onChange={v => set("beds", v)} />
                </div>
              </Card>
            </div>

            {/* Row 2 — Host | Duration | Result */}
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:14 }}>

              {/* Host & Reviews */}
              <Card style={{ padding:18 }}>
                <SH icon="⭐" label="Host & Reviews" />
                <div style={{ display:"flex", flexDirection:"column", gap:12 }}>

                  {/* Toggles */}
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:9 }}>
                    {[
                      ["Cleaning Fee",  form.cleaning_fee==="True", v => set("cleaning_fee", v ? "True" : "False")],
                      ["Instant Book",  form.instant_bookable==="t",v => set("instant_bookable", v ? "t" : "f")],
                      ["Profile Pic",   form.host_has_profile_pic==="t", v => set("host_has_profile_pic", v ? "t" : "f")],
                      ["ID Verified",   form.host_identity_verified==="t",v => set("host_identity_verified", v ? "t" : "f")],
                    ].map(([label, val, setter]) => (
                      <div key={label} style={{ background:"rgba(255,255,255,.025)", borderRadius:10, padding:"9px 11px", border:"1px solid rgba(255,255,255,.05)", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                        <span style={{ fontSize:11, color:"#94a3b8" }}>{label}</span>
                        <Toggle checked={val} onChange={setter} />
                      </div>
                    ))}
                  </div>

                  <div>
                    <div style={{ fontSize:10, color:"#475569", marginBottom:5, fontWeight:600, letterSpacing:".8px", textTransform:"uppercase" }}>No. of Reviews</div>
                    <input type="number" value={form.number_of_reviews} min={0} max={2000}
                      onChange={e => set("number_of_reviews", parseInt(e.target.value)||0)}
                      style={inp} />
                  </div>

                  <div>
                    <div style={{ fontSize:10, color:"#475569", marginBottom:5, fontWeight:600, letterSpacing:".8px", textTransform:"uppercase" }}>
                      Review Score — <span style={{ color:"#ff385c" }}>{form.review_scores_rating}/100</span>
                    </div>
                    <input type="range" className="srange" min={0} max={100} value={form.review_scores_rating}
                      onChange={e => set("review_scores_rating", parseInt(e.target.value))} />
                    <div style={{ display:"flex", justifyContent:"space-between", fontSize:9, color:"#1e293b", marginTop:3 }}>
                      <span>Poor</span><span>Average</span><span>Perfect</span>
                    </div>
                  </div>
                </div>
              </Card>

              {/* Duration */}
              <Card accent style={{ padding:18 }}>
                <SH icon="🗓" label="Stay Duration" />
                <div style={{ textAlign:"center", marginBottom:14 }}>
                  <div style={{ fontFamily:"'Syne',sans-serif", fontWeight:800, fontSize:62, color:"#fff", lineHeight:1 }}>{form.duration_days}</div>
                  <div style={{ fontSize:13, color:"#475569", marginTop:3 }}>day{form.duration_days>1?"s":""}</div>
                </div>
                <input type="range" className="srange" min={1} max={30} value={form.duration_days}
                  onChange={e => set("duration_days", parseInt(e.target.value))} />
                <div style={{ display:"flex", justifyContent:"space-between", fontSize:9, color:"#1e293b", marginTop:4, marginBottom:12 }}>
                  <span>1 day</span><span>2 weeks</span><span>30 days</span>
                </div>
                <div style={{ display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:5, marginBottom:14 }}>
                  {[1,2,3,7,14].map(n => (
                    <button key={n} onClick={() => set("duration_days", n)} style={{
                      padding:"6px 4px", borderRadius:8, border:"1px solid",
                      borderColor: form.duration_days===n ? "#ff385c" : "rgba(255,255,255,.07)",
                      background: form.duration_days===n ? "rgba(255,56,92,.16)" : "rgba(255,255,255,.02)",
                      color: form.duration_days===n ? "#ff385c" : "#475569",
                      fontSize:11, fontWeight:700, cursor:"pointer", fontFamily:"'DM Sans',sans-serif",
                    }}>{n}D</button>
                  ))}
                </div>
                <button className="pred-btn" onClick={predict} disabled={loading}>
                  {loading ? <><span className="spin">⌛</span> <span className="pulse">Analyzing...</span></> : "🎯  Predict Price"}
                </button>
              </Card>

              {/* Result */}
              {result ? (
                <Card key={animKey} accent style={{ padding:18 }} className="anim">
                  <div className="anim">
                    {/* Header */}
                    <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:13, paddingBottom:11, borderBottom:"1px solid rgba(255,255,255,.06)" }}>
                      <span style={{ fontSize:26 }}>{CITIES[result.city]?.flag}</span>
                      <div style={{ flex:1 }}>
                        <div style={{ fontSize:11, color:"#334155" }}>Predicted for</div>
                        <div style={{ fontSize:13, fontWeight:700, color:"#fff" }}>{CITIES[result.city]?.label} · {form.room_type.split("/")[0]}</div>
                      </div>
                      <div style={{ fontSize:10, background:"rgba(16,185,129,.1)", color:"#10b981", padding:"3px 8px", borderRadius:20, border:"1px solid rgba(16,185,129,.18)", fontWeight:700 }}>
                        R² {(result.model_r2*100).toFixed(0)}%
                      </div>
                    </div>

                    {/* Prices */}
                    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:9, marginBottom:12 }}>
                      <div style={{ textAlign:"center", padding:"11px 8px", background:"rgba(255,255,255,.03)", borderRadius:11, border:"1px solid rgba(255,255,255,.06)" }}>
                        <div style={{ fontSize:9, color:"#334155", marginBottom:4, letterSpacing:"1px", textTransform:"uppercase" }}>Per Day</div>
                        <div style={{ fontFamily:"'Syne',sans-serif", fontWeight:800, fontSize:30, color:"#ff385c" }}>${result.per_night_usd}</div>
                        <div style={{ fontSize:9, color:"#1e293b", marginTop:2 }}>USD / night</div>
                      </div>
                      <div style={{ textAlign:"center", padding:"11px 8px", background:"rgba(255,255,255,.03)", borderRadius:11, border:"1px solid rgba(255,255,255,.06)" }}>
                        <div style={{ fontSize:9, color:"#334155", marginBottom:4, letterSpacing:"1px", textTransform:"uppercase" }}>Total ({result.duration_days}D)</div>
                        <div style={{ fontFamily:"'Syne',sans-serif", fontWeight:800, fontSize:30, color:"#10b981" }}>${result.total_usd}</div>
                        <div style={{ fontSize:9, color:"#1e293b", marginTop:2 }}>USD total</div>
                      </div>
                    </div>

                    {/* Confidence */}
                    <div style={{ background:"rgba(255,255,255,.02)", borderRadius:9, padding:"10px 12px", marginBottom:11 }}>
                      <div style={{ fontSize:9, color:"#334155", marginBottom:7, textTransform:"uppercase", letterSpacing:".9px" }}>Confidence Range</div>
                      <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                        <span style={{ fontSize:10, color:"#475569" }}>${result.confidence_low}</span>
                        <div style={{ flex:1, height:4, background:"rgba(255,255,255,.06)", borderRadius:2, position:"relative" }}>
                          <div style={{ position:"absolute", left:"13%", right:"13%", top:0, bottom:0, background:"linear-gradient(90deg,rgba(255,56,92,.2),rgba(255,56,92,.85),rgba(255,56,92,.2))", borderRadius:2 }}/>
                          <div style={{ position:"absolute", left:"50%", top:-5, width:14, height:14, borderRadius:"50%", background:"#ff385c", transform:"translateX(-50%)", boxShadow:"0 0 10px rgba(255,56,92,.7)" }}/>
                        </div>
                        <span style={{ fontSize:10, color:"#475569" }}>${result.confidence_high}</span>
                      </div>
                    </div>

                    {/* Tags */}
                    <div style={{ display:"flex", gap:5, flexWrap:"wrap" }}>
                      {[
                        [`🏠 ${form.room_type.split(" ")[0]}`, "#3b82f6"],
                        [`👥 ${form.accommodates}`,            "#8b5cf6"],
                        [`🛏 ${form.bedrooms}BR`,              "#f59e0b"],
                        [form.cleaning_fee==="True" ? "🧹 Fee" : "No Fee", form.cleaning_fee==="True" ? "#10b981":"#475569"],
                        [form.host_identity_verified==="t" ? "✅ Verified":"👤 Host", form.host_identity_verified==="t"?"#10b981":"#475569"],
                      ].map(([label,color]) => (
                        <span key={label} style={{ fontSize:9, padding:"3px 8px", borderRadius:20, background:`${color}18`, color, border:`1px solid ${color}28`, fontWeight:700 }}>{label}</span>
                      ))}
                    </div>
                  </div>
                </Card>
              ) : (
                <Card style={{ padding:18, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", minHeight:220, borderStyle:"dashed" }}>
                  <div style={{ fontSize:36, marginBottom:12 }}>🏠</div>
                  <div style={{ color:"#334155", fontWeight:600, marginBottom:5 }}>Ready to Predict</div>
                  <div style={{ color:"#1e293b", fontSize:12, textAlign:"center" }}>Configure property details and click Predict Price</div>
                </Card>
              )}
            </div>
          </div>
        )}

        {/* ═══════ ANALYTICS TAB ════════════════════════════ */}
        {tab === "analytics" && (
          <div>
            {result ? (
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14 }}>

                <Card style={{ padding:18 }}>
                  <div style={{ fontSize:13, fontWeight:700, color:"#fff", marginBottom:3 }}>📈 Cost by Duration</div>
                  <div style={{ fontSize:11, color:"#334155", marginBottom:14 }}>Total price over 14 days</div>
                  <ResponsiveContainer width="100%" height={200}>
                    <AreaChart data={durationChart}>
                      <defs>
                        <linearGradient id="ag" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%"  stopColor="#ff385c" stopOpacity={0.25}/>
                          <stop offset="95%" stopColor="#ff385c" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,.04)"/>
                      <XAxis dataKey="d" tick={{ fill:"#334155", fontSize:10 }}/>
                      <YAxis tick={{ fill:"#334155", fontSize:10 }}/>
                      <Tooltip formatter={v=>[`$${v}`,"Total"]} contentStyle={{ background:"#0d1520", border:"1px solid rgba(255,56,92,.3)", borderRadius:8, fontSize:11 }}/>
                      <Area type="monotone" dataKey="total" stroke="#ff385c" strokeWidth={2} fill="url(#ag)" dot={{ fill:"#ff385c", r:2 }}/>
                    </AreaChart>
                  </ResponsiveContainer>
                </Card>

                <Card style={{ padding:18 }}>
                  <div style={{ fontSize:13, fontWeight:700, color:"#fff", marginBottom:3 }}>🎯 Property Profile</div>
                  <div style={{ fontSize:11, color:"#334155", marginBottom:14 }}>Listing quality scores</div>
                  <ResponsiveContainer width="100%" height={200}>
                    <RadarChart data={radarData}>
                      <PolarGrid stroke="rgba(255,255,255,.06)"/>
                      <PolarAngleAxis dataKey="a" tick={{ fill:"#475569", fontSize:10 }}/>
                      <PolarRadiusAxis angle={30} domain={[0,100]} tick={{ fill:"#1e293b", fontSize:9 }}/>
                      <Radar dataKey="v" stroke="#ff385c" fill="#ff385c" fillOpacity={0.18} strokeWidth={2} dot={{ fill:"#ff385c", r:2 }}/>
                    </RadarChart>
                  </ResponsiveContainer>
                </Card>

                <Card style={{ padding:18 }}>
                  <div style={{ fontSize:13, fontWeight:700, color:"#fff", marginBottom:3 }}>💰 Price Breakdown</div>
                  <div style={{ fontSize:11, color:"#334155", marginBottom:14 }}>Estimated factors (per night)</div>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart layout="vertical" data={[
                      { n:"Room type",  v: Math.round(result.per_night_usd*0.42) },
                      { n:"Location",   v: Math.round(result.per_night_usd*0.27) },
                      { n:"Amenities",  v: Math.round(result.per_night_usd*0.19) },
                      { n:"Host trust", v: Math.round(result.per_night_usd*0.12) },
                    ]}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,.04)"/>
                      <XAxis type="number" tick={{ fill:"#334155", fontSize:10 }}/>
                      <YAxis dataKey="n" type="category" tick={{ fill:"#64748b", fontSize:10 }} width={76}/>
                      <Tooltip formatter={v=>[`$${v}`,"Est."]} contentStyle={{ background:"#0d1520", border:"1px solid rgba(255,255,255,.1)", borderRadius:8, fontSize:11 }}/>
                      <Bar dataKey="v" radius={[0,6,6,0]}>
                        {["#ff385c","#f59e0b","#10b981","#3b82f6"].map((c,i) => <Cell key={i} fill={c}/>)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </Card>

                <Card style={{ padding:18 }}>
                  <div style={{ fontSize:13, fontWeight:700, color:"#fff", marginBottom:14 }}>📊 Stats</div>
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:9 }}>
                    {[
                      ["Model R²",   `${(result.model_r2*100).toFixed(0)}%`, "#10b981"],
                      ["Log Price",  result.log_price?.toFixed(3),           "#3b82f6"],
                      ["$ / Guest",  `$${Math.round(result.per_night_usd/Math.max(form.accommodates,1))}`, "#f59e0b"],
                      ["$ / Bed",    `$${Math.round(result.per_night_usd/Math.max(form.beds,1))}`,  "#8b5cf6"],
                      ["City",       result.city,                             "#ff385c"],
                      ["Duration",   `${result.duration_days} days`,         "#64748b"],
                    ].map(([label,val,color]) => (
                      <div key={label} style={{ padding:"10px 12px", background:"rgba(255,255,255,.025)", borderRadius:10, border:"1px solid rgba(255,255,255,.05)" }}>
                        <div style={{ fontSize:10, color:"#334155", marginBottom:3 }}>{label}</div>
                        <div style={{ fontSize:16, fontWeight:700, color }}>{val}</div>
                      </div>
                    ))}
                  </div>
                </Card>
              </div>
            ) : (
              <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", height:380 }}>
                <div style={{ fontSize:44, marginBottom:14 }}>📊</div>
                <div style={{ color:"#334155", fontWeight:600, marginBottom:8 }}>No data yet</div>
                <div style={{ color:"#1e293b", fontSize:13, marginBottom:16 }}>Run a prediction to see analytics</div>
                <button onClick={() => setTab("predict")} style={{ padding:"9px 24px", borderRadius:10, background:"rgba(255,56,92,.15)", border:"1px solid rgba(255,56,92,.3)", color:"#ff385c", cursor:"pointer", fontSize:13, fontWeight:700, fontFamily:"'DM Sans',sans-serif" }}>→ Go to Predict</button>
              </div>
            )}
          </div>
        )}

        {/* ═══════ HISTORY TAB ══════════════════════════════ */}
        {tab === "history" && (
          <div>
            {history.length > 0 ? (
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1.6fr", gap:14 }}>
                <Card style={{ padding:18 }}>
                  <div style={{ fontSize:13, fontWeight:700, color:"#fff", marginBottom:3 }}>📈 Price Trend</div>
                  <div style={{ fontSize:11, color:"#334155", marginBottom:14 }}>Per-day prices</div>
                  <ResponsiveContainer width="100%" height={220}>
                    <LineChart data={histChart}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,.04)"/>
                      <XAxis dataKey="n" tick={{ fill:"#334155", fontSize:10 }}/>
                      <YAxis tick={{ fill:"#334155", fontSize:10 }}/>
                      <Tooltip contentStyle={{ background:"#0d1520", border:"1px solid rgba(255,255,255,.1)", borderRadius:8, fontSize:11 }}/>
                      <Line type="monotone" dataKey="p" stroke="#ff385c" strokeWidth={2} dot={{ fill:"#ff385c", r:4 }} name="$/day"/>
                    </LineChart>
                  </ResponsiveContainer>
                </Card>

                <Card style={{ padding:18, overflowY:"auto", maxHeight:360 }}>
                  <div style={{ fontSize:13, fontWeight:700, color:"#fff", marginBottom:14 }}>🕐 Recent Predictions</div>
                  <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                    {history.map((h, i) => (
                      <div key={i} style={{ display:"flex", alignItems:"center", gap:10, padding:"11px 13px", background:"rgba(255,255,255,.022)", borderRadius:11, border:"1px solid rgba(255,255,255,.05)" }}>
                        <span style={{ fontSize:20 }}>{CITIES[h.city]?.flag}</span>
                        <div style={{ flex:1 }}>
                          <div style={{ fontSize:12, color:"#94a3b8", fontWeight:600 }}>{CITIES[h.city]?.label} · {h.inputs?.room_type?.split("/")[0].trim()}</div>
                          <div style={{ fontSize:10, color:"#334155" }}>{h.duration_days}D · {h.ts}</div>
                        </div>
                        <div style={{ textAlign:"right" }}>
                          <div style={{ fontSize:15, fontWeight:700, color:"#ff385c" }}>${h.per_night_usd}/day</div>
                          <div style={{ fontSize:11, color:"#10b981" }}>${h.total_usd} total</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>
              </div>
            ) : (
              <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", height:380 }}>
                <div style={{ fontSize:44, marginBottom:14 }}>🕐</div>
                <div style={{ color:"#334155", fontWeight:600, marginBottom:8 }}>No history yet</div>
                <button onClick={() => setTab("predict")} style={{ padding:"9px 24px", borderRadius:10, background:"rgba(255,56,92,.15)", border:"1px solid rgba(255,56,92,.3)", color:"#ff385c", cursor:"pointer", fontSize:13, fontWeight:700, fontFamily:"'DM Sans',sans-serif" }}>→ Make First Prediction</button>
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}