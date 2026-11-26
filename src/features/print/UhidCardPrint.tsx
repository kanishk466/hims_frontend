import { useParams } from 'react-router-dom'
import { isApiError } from '@/api/client'
import { QrCode } from '@/components/QrCode'
import { formatDate } from '@/lib/dates'
import { patientAgeSex } from '../opd/format'
import { usePatient } from '../opd/queries'
import { PrintSheet } from './PrintLayout'
import { useLetterhead } from './queries'

/** OPD-01: wallet-size patient card with the UHID as a QR code (only the UHID is encoded). */
export function UhidCardPrint() {
  const { patientId } = useParams()
  const { data: p, error } = usePatient(patientId)
  const { data: lh } = useLetterhead()
  return (
    <PrintSheet title="Patient card" size="card" ready={!!(p && lh)} error={isApiError(error) ? error.message : undefined}>
      {p && lh && (
        <div style={{ height: '48mm', display: 'flex', flexDirection: 'column' }}>
          <div
            style={{
              fontWeight: 700,
              fontSize: 13,
              borderBottom: '1px solid #333',
              paddingBottom: 2,
            }}
          >
            {lh.name}
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 6, flex: 1 }}>
            <div style={{ flex: 1, fontSize: 11 }}>
              <div style={{ fontWeight: 700, fontSize: 13 }}>{p.name}</div>
              <div>{patientAgeSex(p)}</div>
              <div
                style={{
                  fontWeight: 700,
                  fontSize: 13,
                  marginTop: 4,
                  letterSpacing: 0.5,
                }}
              >
                {p.uhid}
              </div>
              <div className="muted">Registered {formatDate(p.createdAt)}</div>
            </div>
            <QrCode value={p.uhid} size={72} label={`QR code for ${p.uhid}`} />
          </div>
          <div className="muted" style={{ fontSize: 9 }}>
            Bring this card on every visit · {lh.phone}
          </div>
        </div>
      )}
    </PrintSheet>
  )
}
