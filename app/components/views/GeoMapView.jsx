'use client';
import { fmt, TC, sortPrefs } from '../shared';

export default function GeoMapView({ mob, geoFacilities, selectedFacility, setSelectedFacility, mapPref, setMapPref }) {
  return <>
          <div style={{marginBottom:24,display:'flex',flexDirection:mob?'column':'row',justifyContent:'space-between',alignItems:mob?'flex-start':'flex-end',gap:12}}>
            <div>
              <div style={{fontSize:11,color:'#2563EB',fontWeight:600,letterSpacing:'0.08em',textTransform:'uppercase',marginBottom:4}}>Facility Map</div>
              <h1 style={{fontSize:22,fontWeight:700,letterSpacing:'-0.03em',margin:0}}>施設マッピング</h1>
              <p style={{fontSize:13,color:'#94a3b8',margin:'4px 0 0'}}>Tier S/A {geoFacilities.length}施設を地図上に表示。施設をクリックで詳細表示。</p>
            </div>
            <select value={mapPref} onChange={e=>{setMapPref(e.target.value);setSelectedFacility(null);}} style={{padding:'8px 14px',borderRadius:8,border:'1px solid #e2e8f0',fontSize:13,background:'#fff',cursor:'pointer'}}>
              <option value="">全国</option>
              {sortPrefs([...new Set(geoFacilities.map(f=>f.pref))]).map(p=><option key={p} value={p}>{p}</option>)}
            </select>
          </div>

          <div style={{display:'flex',flexDirection:mob?'column-reverse':'row',gap:16}}>
            {/* Facility List */}
            <div style={{flex:1,background:'#fff',borderRadius:14,border:'1px solid #f0f0f0',overflow:'hidden'}}>
              <div style={{maxHeight:mob?400:560,overflowY:'auto',padding:12}}>
                <div style={{fontSize:13,fontWeight:600,marginBottom:8,color:'#0f172a'}}>
                  {mapPref||'全国'} — {(mapPref?geoFacilities.filter(f=>f.pref===mapPref):geoFacilities).length}施設
                </div>
                {(mapPref?geoFacilities.filter(f=>f.pref===mapPref):geoFacilities).map((f,i)=>(
                  <div key={i} onClick={()=>setSelectedFacility(f)} style={{padding:'8px 10px',marginBottom:4,borderRadius:8,cursor:'pointer',background:selectedFacility?.code===f.code?'#eff6ff':'#fff',border:'1px solid '+(selectedFacility?.code===f.code?'#2563EB':'#f0f0f0'),fontSize:12,transition:'all 0.1s'}}>
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                      <span style={{fontWeight:600,color:'#1e293b'}}>{f.name.slice(0,25)}</span>
                      <span style={{padding:'1px 8px',borderRadius:12,fontSize:10,fontWeight:700,background:f.tier==='S'?'#fef2f2':'#fff7ed',color:f.tier==='S'?'#dc2626':'#f97316'}}>{f.score}pt</span>
                    </div>
                    <div style={{color:'#94a3b8',fontSize:11,marginTop:2}}>{f.pref} | {f.beds}床 | {fmt(f.cases)}症例</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Facility Detail Panel */}
            {selectedFacility && (
              <div style={{background:'#fff',borderRadius:14,border:'1px solid #f0f0f0',overflow:'hidden',display:'flex',flexDirection:'column',width:mob?'100%':380,flexShrink:0}}>
                <div style={{padding:'16px 20px',borderBottom:'1px solid #f0f0f0'}}>
                  <div style={{fontSize:16,fontWeight:700,color:'#0f172a',marginBottom:4}}>{selectedFacility.name}</div>
                  <div style={{fontSize:12,color:'#64748b'}}>{selectedFacility.pref} / {selectedFacility.addr}</div>
                  <div style={{display:'flex',gap:6,marginTop:8}}>
                    <span style={{padding:'3px 10px',borderRadius:20,fontSize:11,fontWeight:600,background:TC[selectedFacility.tier]+'18',color:TC[selectedFacility.tier]}}>Tier {selectedFacility.tier}</span>
                    <span style={{padding:'3px 10px',borderRadius:20,fontSize:11,fontWeight:600,background:'#eff6ff',color:'#2563EB'}}>{selectedFacility.score}pt</span>
                  </div>
                </div>
                <div style={{padding:'16px 20px',borderBottom:'1px solid #f0f0f0'}}>
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
                    {[{l:'病床数',v:fmt(selectedFacility.beds),c:'#2563EB'},{l:'年間症例',v:fmt(selectedFacility.cases),c:'#059669'}].map((k,i)=>(
                      <div key={i} style={{textAlign:'center'}}>
                        <div style={{fontSize:11,color:'#94a3b8',marginBottom:2}}>{k.l}</div>
                        <div style={{fontSize:22,fontWeight:700,color:k.c}}>{k.v}</div>
                      </div>
                    ))}
                  </div>
                </div>
                {/* Google Maps iframe */}
                <div style={{flex:1,minHeight:250}}>
                  <iframe
                    width="100%" height="100%" frameBorder="0" style={{border:0}}
                    src={`https://maps.google.com/maps?q=${encodeURIComponent(selectedFacility.pref + selectedFacility.addr + ' ' + selectedFacility.name)}&t=m&z=15&output=embed`}
                    allowFullScreen
                  />
                </div>
              </div>
            )}
          </div>
        
  </>;
}
