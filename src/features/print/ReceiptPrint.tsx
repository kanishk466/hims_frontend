import { useParams, useSearchParams } from 'react-router-dom'
import { isApiError } from '@/api/client'
import { formatDateTime, formatDay } from '@/lib/dates'
import { amountInWords, formatINR } from '@/lib/money'
import type { BillView } from '@/types/opd'
import { useValueList } from '../masters/queries'
import { patientAgeSex } from '../opd/format'
import { useBill } from '../opd/queries'
import { Letterhead } from './Letterhead'
import type { PageSize } from './pageSizes'
import { PrintSheet } from './PrintLayout'
import { useLetterhead } from './queries'

/** OPD-11: bill-cum-receipt, A5 for the file or 80 mm thermal for the counter. */
export function ReceiptPrint() {
  const { billId } = useParams()
  const [params] = useSearchParams()
  const size: PageSize = params.get('size') === 'a5' ? 'a5' : 'thermal'
  const { data: b, error } = useBill(billId)
  const { data: lh } = useLetterhead()
  const { data: modes } = useValueList('paymentMode')
  const modeName = (code: string) => modes?.find((m) => m.code === code)?.label ?? code
  const thermal = size === 'thermal'

  return (
    <PrintSheet title={b ? `Bill ${b.billNo}` : 'Bill'} size={size} sizes={['thermal', 'a5']} ready={!!(b && lh)} error={isApiError(error) ? error.message : undefined}>
      {b && lh && (
        <div style={{ position: 'relative' }}>
          {b.status === 'cancelled' && <Stamp text="CANCELLED" />}
          <Letterhead c={lh} compact={thermal} />
          {thermal && <hr />}
          <div style={{ textAlign: 'center', fontWeight: 700, margin: '4px 0' }}>{b.panelPaise > 0 ? 'OPD BILL (PANEL)' : 'OPD BILL CUM RECEIPT'}</div>
          <table>
            <tbody>
              <Row a="Bill no." b={b.billNo} c="Date" d={formatDateTime(b.createdAt)} thermal={thermal} />
              <Row a="Patient" b={b.patient.name} c="UHID" d={b.patient.uhid} thermal={thermal} />
              <Row a="Age/Sex" b={patientAgeSex(b.patient)} c="Visit" d={`${b.visit.visitNo} (${formatDay(b.visit.date)})`} thermal={thermal} />
              <Row a="Doctor" b={b.visit.doctorName} c="Payer" d={b.payerName} thermal={thermal} />
            </tbody>
          </table>
          <hr />
          <Lines b={b} thermal={thermal} />
          <hr />
          <table>
            <tbody>
              <Total label="Total" value={b.grossPaise} />
              {b.panelPaise > 0 && <Total label={`Payable by ${b.payerName}`} value={-b.panelPaise} />}
              {b.discount && ['auto', 'approved'].includes(b.discount.status) && <Total label={`Discount (${b.discount.reason})`} value={-b.discount.amountPaise} />}
              <Total label="Patient pays" value={b.patientNetPaise} bold />
              <Total label="Paid" value={b.paidPaise} />
              {b.patientNetPaise - b.paidPaise > 0 && b.status !== 'cancelled' && <Total label="Balance due" value={b.patientNetPaise - b.paidPaise} bold />}
            </tbody>
          </table>
          <div style={{ fontSize: 10, marginTop: 4 }}>{amountInWords(b.paidPaise)}</div>
          {b.receipts.length > 0 && (
            <>
              <hr />
              <table style={{ fontSize: 11 }}>
                <tbody>
                  {b.receipts.map((r) => (
                    <tr key={r.id}>
                      <td>
                        {r.kind === 'refund' ? 'Refund ' : ''}
                        {r.receiptNo}
                        <div className="muted">{r.lines.map((l) => `${modeName(l.mode)}${l.reference ? ` (${l.reference})` : ''}`).join(' + ')}</div>
                      </td>
                      <td className="num">{formatINR(r.totalPaise)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
          {b.status === 'cancelled' && (
            <div style={{ fontSize: 11, marginTop: 4 }}>
              Cancelled
              {b.cancelledAt ? ` on ${formatDateTime(b.cancelledAt)}` : ''}: {b.cancelReason}
            </div>
          )}
          <hr />
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: 10,
              marginTop: thermal ? 0 : 24,
            }}
          >
            <span>Billed by {b.createdByName}</span>
            {!thermal && <span>Authorised signatory</span>}
          </div>
          <div className="muted" style={{ fontSize: 9, textAlign: 'center', marginTop: 4 }}>
            This is a computer-generated receipt.
          </div>
        </div>
      )}
    </PrintSheet>
  )
}

function Row({ a, b, c, d, thermal }: { a: string; b: string; c: string; d: string; thermal: boolean }) {
  if (thermal)
    return (
      <>
        <tr>
          <td className="muted">{a}</td>
          <td>{b}</td>
        </tr>
        <tr>
          <td className="muted">{c}</td>
          <td>{d}</td>
        </tr>
      </>
    )
  return (
    <tr>
      <td className="muted" style={{ width: '14%' }}>
        {a}
      </td>
      <td style={{ width: '36%' }}>
        <b>{b}</b>
      </td>
      <td className="muted" style={{ width: '14%' }}>
        {c}
      </td>
      <td>{d}</td>
    </tr>
  )
}

function Lines({ b, thermal }: { b: BillView; thermal: boolean }) {
  const panel = b.panelPaise > 0
  return (
    <table>
      <thead>
        <tr className="rule">
          <th>Service</th>
          {!thermal && <th className="num">Qty</th>}
          {!thermal && <th className="num">Rate</th>}
          {panel && !thermal && <th className="num">Panel</th>}
          <th className="num">{panel ? 'Patient' : 'Amount'}</th>
        </tr>
      </thead>
      <tbody>
        {b.lines.map((l) => (
          <tr key={l.id}>
            <td>
              {l.name}
              {thermal && l.qty > 1 ? ` × ${l.qty}` : ''}
            </td>
            {!thermal && <td className="num">{l.qty}</td>}
            {!thermal && <td className="num">{formatINR(l.ratePaise)}</td>}
            {panel && !thermal && <td className="num">{formatINR(l.panelPaise)}</td>}
            <td className="num">{formatINR(panel ? l.patientPaise : l.amountPaise)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function Total({ label, value, bold }: { label: string; value: number; bold?: boolean }) {
  return (
    <tr style={{ fontWeight: bold ? 700 : 400 }}>
      <td>{label}</td>
      <td className="num">{value < 0 ? `− ${formatINR(-value)}` : formatINR(value)}</td>
    </tr>
  )
}

function Stamp({ text }: { text: string }) {
  return (
    <div
      style={{
        position: 'absolute',
        top: '40%',
        left: 0,
        right: 0,
        textAlign: 'center',
        transform: 'rotate(-18deg)',
        fontSize: 40,
        fontWeight: 800,
        color: 'rgba(200,0,0,0.25)',
        border: '4px solid rgba(200,0,0,0.25)',
        pointerEvents: 'none',
      }}
    >
      {text}
    </div>
  )
}
