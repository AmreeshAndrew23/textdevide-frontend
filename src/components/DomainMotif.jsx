// Decorative line art for a generated app's dashboard hero and sign-in panel — one motif per
// domain (a heartbeat for healthcare, a skyline for property, arches for hospitality…), drawn in
// currentColor so each design language tints it its own way. Purely decorative: aria-hidden.

const MOTIFS = {
  healthcare: (
    <>
      <path d="M0 150 H110 L130 110 L150 190 L175 70 L200 160 L215 130 H400" strokeWidth="3" />
      {[[300, 60], [350, 110], [260, 200], [60, 70]].map(([x, y]) => (
        <path key={`${x}${y}`} d={`M${x - 12} ${y} H${x + 12} M${x} ${y - 12} V${y + 12}`} strokeWidth="5" strokeLinecap="round" />
      ))}
    </>
  ),
  fintech: (
    <>
      <path d="M10 210 L80 170 L130 185 L200 120 L260 135 L330 60 L390 40" strokeWidth="3.5" />
      <path d="M10 210 L80 170 L130 185 L200 120 L260 135 L330 60 L390 40 V240 H10 Z" fill="currentColor" stroke="none" opacity="0.12" />
      {[[330, 60], [200, 120], [80, 170]].map(([x, y]) => <circle key={x} cx={x} cy={y} r="7" fill="currentColor" stroke="none" />)}
      <circle cx="90" cy="60" r="26" strokeWidth="3" /><circle cx="90" cy="60" r="16" strokeWidth="2" />
    </>
  ),
  finance: (
    <>
      {[40, 100, 160, 220, 280, 340].map((x, i) => <rect key={x} x={x} y={200 - [60, 90, 70, 120, 100, 150][i]} width="34" height={[60, 90, 70, 120, 100, 150][i]} rx="3" strokeWidth="2.5" />)}
      <path d="M20 160 L110 110 L180 130 L260 70 L370 40" strokeWidth="3" strokeDasharray="8 7" />
    </>
  ),
  education: (
    <>
      <circle cx="70" cy="70" r="38" strokeWidth="4" />
      <path d="M190 40 L240 130 H140 Z" strokeWidth="4" strokeLinejoin="round" />
      <rect x="290" y="40" width="70" height="70" rx="12" strokeWidth="4" transform="rotate(14 325 75)" />
      <path d="M40 190 q40 -40 80 0 t80 0 t80 0 t80 0" strokeWidth="4" />
      <circle cx="350" cy="190" r="12" fill="currentColor" stroke="none" />
    </>
  ),
  hr: (
    <>
      {[[120, 120], [200, 100], [280, 120]].map(([x, y]) => (
        <g key={x}><circle cx={x} cy={y - 30} r="22" strokeWidth="3" /><path d={`M${x - 38} ${y + 50} q38 -60 76 0`} strokeWidth="3" /></g>
      ))}
      <circle cx="200" cy="120" r="110" strokeWidth="1.5" strokeDasharray="4 8" />
    </>
  ),
  commerce: (
    <>
      <path d="M60 60 H150 L190 100 L120 170 L60 110 Z" strokeWidth="3.5" strokeLinejoin="round" /><circle cx="90" cy="88" r="8" strokeWidth="3" />
      <path d="M240 90 H340 L330 200 H250 Z" strokeWidth="3.5" strokeLinejoin="round" /><path d="M265 90 q25 -55 50 0" strokeWidth="3.5" />
      {[[200, 210], [370, 50], [30, 200]].map(([x, y]) => <circle key={x} cx={x} cy={y} r="6" fill="currentColor" stroke="none" />)}
    </>
  ),
  logistics: (
    <>
      <path d="M30 200 C120 200 90 80 190 90 S300 190 370 60" strokeWidth="3.5" strokeDasharray="10 9" />
      {[[30, 200], [190, 90], [370, 60]].map(([x, y]) => <g key={x}><circle cx={x} cy={y} r="13" strokeWidth="3.5" /><circle cx={x} cy={y} r="4" fill="currentColor" stroke="none" /></g>)}
      <rect x="250" y="170" width="70" height="40" rx="4" strokeWidth="3" /><path d="M320 182 H345 L360 198 V210 H320" strokeWidth="3" />
    </>
  ),
  media: (
    <>
      {Array.from({ length: 26 }, (_, i) => {
        const hgt = 20 + Math.abs(Math.sin(i * 0.9) * 90) + (i % 3) * 12;
        return <rect key={i} x={12 + i * 15} y={120 - hgt / 2} width="7" height={hgt} rx="3.5" fill="currentColor" stroke="none" opacity={0.35 + (i % 4) * 0.15} />;
      })}
    </>
  ),
  crm: (
    <>
      <path d="M60 40 H340 L280 110 H120 Z" strokeWidth="3.5" strokeLinejoin="round" />
      <path d="M125 125 H275 L235 175 H165 Z" strokeWidth="3.5" strokeLinejoin="round" />
      <path d="M170 190 H230 L215 215 H185 Z" strokeWidth="3.5" strokeLinejoin="round" />
      <path d="M360 60 l20 20 l-20 20" strokeWidth="3" />
    </>
  ),
  property: (
    <>
      <path d="M0 220 H400" strokeWidth="2.5" />
      {[[20, 120, 50], [80, 60, 60], [150, 140, 40], [200, 30, 70], [280, 100, 50], [340, 150, 45]].map(([x, top, w]) => (
        <g key={x}>
          <rect x={x} y={top} width={w} height={220 - top} strokeWidth="2.5" />
          {Array.from({ length: Math.floor((200 - top) / 26) }, (_, r) => (
            <path key={r} d={`M${x + 10} ${top + 16 + r * 26} h${w / 2 - 14} M${x + w / 2 + 4} ${top + 16 + r * 26} h${w / 2 - 14}`} strokeWidth="4" strokeLinecap="round" opacity="0.6" />
          ))}
        </g>
      ))}
    </>
  ),
  hospitality: (
    <>
      {[60, 160, 260, 360].map((x) => <path key={x} d={`M${x - 38} 230 V120 a38 38 0 0 1 76 0 V230`} strokeWidth="3" />)}
      <path d="M0 230 H400" strokeWidth="2" />
      <circle cx="200" cy="40" r="16" strokeWidth="2.5" /><path d="M170 40 H120 M230 40 H280" strokeWidth="2" />
    </>
  ),
  projects: (
    <>
      {[30, 160, 290].map((x, c) => (
        <g key={x}>
          <rect x={x} y="20" width="100" height="200" rx="10" strokeWidth="2.5" />
          {Array.from({ length: [3, 2, 4][c] }, (_, r) => <rect key={r} x={x + 12} y={40 + r * 42} width="76" height="30" rx="6" fill="currentColor" stroke="none" opacity="0.35" />)}
        </g>
      ))}
    </>
  ),
};

export default function DomainMotif({ domain, style }) {
  const art = MOTIFS[domain];
  if (!art) {
    return (
      <svg viewBox="0 0 400 240" style={style} aria-hidden="true">
        {Array.from({ length: 60 }, (_, i) => <circle key={i} cx={20 + (i % 10) * 40} cy={20 + Math.floor(i / 10) * 40} r="3" fill="currentColor" />)}
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 400 240" fill="none" stroke="currentColor" strokeLinecap="round" style={style} aria-hidden="true">
      {art}
    </svg>
  );
}
