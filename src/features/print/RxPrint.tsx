import { useParams, useSearchParams } from 'react-router-dom'
import { isApiError } from '@/api/client'
import { formatDateTime, formatDay } from '@/lib/dates'
import { FREQUENCY_HI, TIMING_HI } from '@/lib/opd/rx'
import { useValueList } from '../masters/queries'
import { patientAgeSex } from '../opd/format'
import { usePrescriptionView } from '../opd/queries'
import { Letterhead } from './Letterhead'
import type { PageSize } from './pageSizes'
import { PrintSheet } from './PrintLayout'

const UNIT = { D: 'days', W: 'weeks', M: 'months' } as const
const UNIT_HI = { D: 'दिन', W: 'हफ़्ते', M: 'महीने' } as const

/** OPD-08/10: printed prescription, English with Hindi dosing lines; generic names in capitals. */
export function RxPrint() {
  const { visitId } = useParams()
  const [params] = useSearchParams()
  const size: PageSize = params.get('size') === 'a4' ? 'a4' : 'a5'
  const { data: r, error } = usePrescriptionView(visitId)
  const hindi = params.get('lang') !== 'en'
  const { data: allergyList } = useValueList('allergy')
  const allergyName = (code: string) => allergyList?.find((a) => a.code === code)?.label ?? code

  return (
    <PrintSheet title={r ? `Prescription · ${r.patient.name}` : 'Prescription'} size={size} sizes={['a5', 'a4']} ready={!!r} error={isApiError(error) ? error.message : undefined}>
      {r && (
        <div
          style={{
            minHeight: size === 'a4' ? '260mm' : '180mm',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <Letterhead
            c={{ ...r.clinic, state: '', gstin: undefined }}
            extra={
              <div style={{ textAlign: 'right', fontSize: 11 }}>
                <div style={{ fontWeight: 700, fontSize: 13 }}>{r.doctor.name}</div>
                <div>{r.doctor.qualification}</div>
                <div>{r.doctor.departmentName}</div>
                <div className="muted">
                  Reg. no. {r.doctor.registrationNo} ({r.doctor.council})
                </div>
              </div>
            }
          />
          <table style={{ fontSize: 11 }}>
            <tbody>
              <tr>
                <td>
                  <b>{r.patient.name}</b> · {patientAgeSex(r.patient)} · {r.patient.uhid}
                </td>
                <td className="num">
                  {r.visit.visitNo} · {formatDay(r.visit.date)}
                </td>
              </tr>
            </tbody>
          </table>
          {r.visit.mlc && (
            <div style={{ fontSize: 11, fontWeight: 700, border: '1px solid #c00', color: '#c00', padding: '2px 6px', margin: '4px 0', display: 'inline-block' }}>
              MEDICO-LEGAL CASE · MLC {r.visit.mlc.mlcNo} · {r.visit.mlc.policeStation}
            </div>
          )}
          {r.patient.allergies.length > 0 && <div style={{ fontSize: 11, fontWeight: 700 }}>Allergies: {r.patient.allergies.map(allergyName).join(', ')}</div>}
          {r.vitals && <div style={{ fontSize: 11 }}>{vitalsLine(r.vitals)}</div>}
          <hr />
          {(r.note.complaints.length > 0 || r.note.complaintText) && <Block label="Complaints">{[r.note.complaints.join(', '), r.note.complaintText].filter(Boolean).join('. ')}</Block>}
          {r.note.examination && <Block label="Examination">{r.note.examination}</Block>}
          {r.note.diagnoses.length > 0 && <Block label="Diagnosis">{r.note.diagnoses.map((d) => `${d.name} (${d.code})${d.type === 'provisional' ? ' – provisional' : ''}`).join('; ')}</Block>}
          {r.note.rx.length > 0 && (
            <>
              <div
                style={{
                  fontSize: 22,
                  fontWeight: 700,
                  fontFamily: 'serif',
                  marginTop: 6,
                }}
              >
                ℞
              </div>
              <table>
                <tbody>
                  {r.note.rx.map((it, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid #ddd' }}>
                      <td style={{ width: 18 }}>{i + 1}.</td>
                      <td>
                        <div>
                          <b>{it.generic.toUpperCase()}</b> {it.strength}{' '}
                          <span className="muted">
                            ({it.brand}, {it.form.toLowerCase()})
                          </span>
                        </div>
                        <div>
                          {it.dose} · {r.labels.frequency[it.frequency] ?? it.frequency}
                          {it.timing ? ` · ${r.labels.timing[it.timing] ?? it.timing}` : ''}
                          {it.route !== 'PO' ? ` · ${r.labels.route[it.route] ?? it.route}` : ''} · {it.duration} {UNIT[it.durationUnit]}
                          {it.instructions ? ` · ${it.instructions}` : ''}
                        </div>
                        {hindi && (
                          <div className="hi muted">{[FREQUENCY_HI[it.frequency], it.timing && TIMING_HI[it.timing], `${it.duration} ${UNIT_HI[it.durationUnit]}`].filter(Boolean).join(' · ')}</div>
                        )}
                      </td>
                      <td className="num" style={{ width: 50 }}>
                        {it.qty ? `Qty ${it.qty}` : ''}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
          {r.orders.length > 0 && <Block label="Investigations">{r.orders.map((o) => o.serviceName).join(', ')}</Block>}
          {r.note.advice && <Block label="Advice">{r.note.advice}</Block>}
          {r.note.followUpDate && (
            <Block label="Follow-up">
              {formatDay(r.note.followUpDate)}
              {hindi && <span className="hi"> (दोबारा दिखाने की तारीख)</span>}
            </Block>
          )}
          {r.note.addenda.map((a, i) => (
            <Block key={i} label={`Addendum ${formatDateTime(a.at)}`}>
              {a.text}
            </Block>
          ))}
          <div style={{ flex: 1 }} />
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-end',
              marginTop: 24,
              fontSize: 10,
            }}
          >
            <div className="muted">
              {r.note.lockedAt ? `Signed electronically ${formatDateTime(r.note.lockedAt)}` : 'DRAFT: consultation not completed'}
              <br />
              Printed {formatDateTime(r.printedAt)}
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontWeight: 700, fontSize: 12 }}>{r.doctor.name}</div>
              <div>Reg. no. {r.doctor.registrationNo}</div>
            </div>
          </div>
        </div>
      )}
    </PrintSheet>
  )
}

function Block({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ margin: '4px 0' }}>
      <b>{label}:</b> <span style={{ whiteSpace: 'pre-wrap' }}>{children}</span>
    </div>
  )
}

function vitalsLine(v: NonNullable<ReturnType<typeof usePrescriptionView>['data']>['vitals']): string {
  if (!v) return ''
  const parts = [
    v.bpSys !== undefined && `BP ${v.bpSys}/${v.bpDia ?? '–'}`,
    v.pulse !== undefined && `Pulse ${v.pulse}`,
    v.tempF !== undefined && `Temp ${v.tempF}°F`,
    v.spo2 !== undefined && `SpO₂ ${v.spo2}%`,
    v.weightKg !== undefined && `Wt ${v.weightKg} kg`,
    v.bmi !== undefined && `BMI ${v.bmi}`,
    v.sugar !== undefined && `Sugar ${v.sugar}`,
  ].filter(Boolean)
  return parts.length ? `Vitals: ${parts.join(' · ')}` : ''
}
