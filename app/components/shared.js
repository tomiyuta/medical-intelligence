// Shared utilities and constants for MedIntel views
export const PREF_ORDER = ['北海道','青森県','岩手県','宮城県','秋田県','山形県','福島県','茨城県','栃木県','群馬県','埼玉県','千葉県','東京都','神奈川県','新潟県','富山県','石川県','福井県','山梨県','長野県','岐阜県','静岡県','愛知県','三重県','滋賀県','京都府','大阪府','兵庫県','奈良県','和歌山県','鳥取県','島根県','岡山県','広島県','山口県','徳島県','香川県','愛媛県','高知県','福岡県','佐賀県','長崎県','熊本県','大分県','宮崎県','鹿児島県','沖縄県'];
export const sortPrefs = arr => [...arr].sort((a,b) => PREF_ORDER.indexOf(a) - PREF_ORDER.indexOf(b));
export const fmt = n => n?.toLocaleString?.() ?? '—';
export const TC = { S:'#dc2626', A:'#f97316', B:'#eab308', C:'#22c55e', D:'#94a3b8' };
export const METRICS = { f:'施設数', h:'病院数', d:'DPC病院', b:'総病床数', c:'がん死亡', hr:'心疾患死亡', s:'脳血管死亡' };
export const mKey = { f:'facilities', h:'hospitals', d:'dpc', b:'beds', c:'cancer', hr:'heart', s:'stroke' };
export const NDB_CAT = {'A_初再診料':'初再診料','B_医学管理等':'医学管理等','C_在宅医療':'在宅医療','D_検査':'検査','E_画像診断':'画像診断','K_手術':'手術'};

export const downloadCSV = (rows, filename) => {
  const bom = '\uFEFF';
  const csv = rows.map(r => r.map(c => `"${String(c??'').replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob = new Blob([bom + csv], {type:'text/csv;charset=utf-8'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
};

export const Tip = ({active,payload,label}) => {
  if(!active||!payload?.length) return null;
  return <div style={{background:'#fff',border:'1px solid #e2e8f0',borderRadius:8,padding:'8px 12px',boxShadow:'0 4px 12px rgba(0,0,0,0.08)',fontSize:12}}>
    <div style={{fontWeight:600,marginBottom:3}}>{label}</div>
    {payload.map((p,i)=><div key={i} style={{color:p.color,display:'flex',justifyContent:'space-between',gap:16}}>
      <span>{p.name}</span><span style={{fontWeight:600}}>{fmt(p.value)}</span></div>)}
  </div>;
};
