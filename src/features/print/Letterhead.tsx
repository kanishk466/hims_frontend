import type { Letterhead as L } from '@/api/print'

/** Clinic name and address at the top of every print. `printSettings` is carried by the API type but not used here yet. */
export function Letterhead({ c, compact, extra }: { c: Omit<L, 'printSettings'> & Partial<Pick<L, 'printSettings'>>; compact?: boolean; extra?: React.ReactNode }) {
  if (compact)
    return (
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontWeight: 700, fontSize: 14 }}>{c.name}</div>
        <div className="muted" style={{ fontSize: 10 }}>
          {c.addressLine}, {c.city} {c.pinCode}
          <br />
          Ph: {c.phone}
          {c.gstin ? ` · GSTIN ${c.gstin}` : ''}
        </div>
      </div>
    )
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        borderBottom: '2px solid #333',
        paddingBottom: 8,
        marginBottom: 10,
      }}
    >
      {c.logoDataUrl && <img src={c.logoDataUrl} alt="" style={{ height: 48, width: 48, objectFit: 'contain' }} />}
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 700, fontSize: 18 }}>{c.name}</div>
        <div className="muted" style={{ fontSize: 11 }}>
          {c.addressLine}, {c.city}, {c.state} {c.pinCode} · Ph: {c.phone}
          {c.email ? ` · ${c.email}` : ''}
        </div>
        <div className="muted" style={{ fontSize: 10 }}>
          Reg. no. {c.registrationNo}
          {c.gstin ? ` · GSTIN ${c.gstin}` : ''}
        </div>
      </div>
      {extra}
    </div>
  )
}
