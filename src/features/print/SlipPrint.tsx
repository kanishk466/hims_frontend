import { useParams } from 'react-router-dom'
import { isApiError } from '@/api/client'
import { formatDateTime } from '@/lib/dates'
import { patientAgeSex } from '../opd/format'
import { useVisit } from '../opd/queries'
import { Letterhead } from './Letterhead'
import { PrintSheet } from './PrintLayout'
import { useLetterhead } from './queries'

/** OPD-03: token slip for the 80 mm thermal printer at check-in. */
export function SlipPrint() {
  const { visitId } = useParams()
  const { data: v, error } = useVisit(visitId)
  const { data: lh } = useLetterhead()
  return (
    <PrintSheet title={v ? `Token ${v.token}` : 'Token slip'} size="thermal" ready={!!(v && lh)} error={isApiError(error) ? error.message : undefined}>
      {v && lh && (
        <>
          <Letterhead c={lh} compact />
          <hr />
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 11 }}>TOKEN</div>
            <div style={{ fontSize: 44, fontWeight: 800, lineHeight: 1 }}>{v.token}</div>
            <div style={{ fontWeight: 700, marginTop: 4 }}>{v.doctorName}</div>
            <div style={{ fontSize: 11 }}>
              {v.departmentName}
              {v.room ? ` · Room ${v.room}` : ''}
            </div>
          </div>
          <hr />
          <table>
            <tbody>
              <tr>
                <td className="muted">Patient</td>
                <td>
                  <b>{v.patient.name}</b>
                </td>
              </tr>
              <tr>
                <td className="muted">UHID</td>
                <td>{v.patient.uhid}</td>
              </tr>
              <tr>
                <td className="muted">Age/Sex</td>
                <td>{patientAgeSex(v.patient)}</td>
              </tr>
              <tr>
                <td className="muted">Visit</td>
                <td>
                  {v.visitNo} · {v.visitTypeLabel}
                </td>
              </tr>
              <tr>
                <td className="muted">Payer</td>
                <td>{v.payerName}</td>
              </tr>
              {v.mlc && (
                <tr>
                  <td className="muted">MLC</td>
                  <td>
                    <b>
                      {v.mlc.mlcNo}, {v.mlc.policeStation}
                    </b>
                  </td>
                </tr>
              )}
              <tr>
                <td className="muted">Time</td>
                <td>{formatDateTime(v.checkedInAt)}</td>
              </tr>
            </tbody>
          </table>
          <hr />
          <div style={{ textAlign: 'center', fontSize: 10 }}>Please wait for your token number on the screen.</div>
        </>
      )}
    </PrintSheet>
  )
}
