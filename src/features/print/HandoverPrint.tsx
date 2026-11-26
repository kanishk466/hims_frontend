import { useParams } from 'react-router-dom'
import { isApiError } from '@/api/client'
import { formatDateTime } from '@/lib/dates'
import { formatINR } from '@/lib/money'
import { DENOMINATIONS } from '@/types/dayEnd'
import { useClosing } from '../dayEnd/queries'
import { Letterhead } from './Letterhead'
import { PrintSheet } from './PrintLayout'
import { useLetterhead } from './queries'

/** 80 mm cash handover slip: goes into the cash bag with the notes. */
export function HandoverPrint() {
  const { closingId } = useParams()
  const { data: c, error } = useClosing(closingId)
  const { data: lh } = useLetterhead()
  return (
    <PrintSheet title="Cash handover" size="thermal" ready={!!(c && lh)} error={isApiError(error) ? error.message : undefined}>
      {c && lh && (
        <>
          <Letterhead c={lh} compact />
          <hr />
          <div style={{ textAlign: 'center', fontWeight: 700 }}>CASH HANDOVER</div>
          <div>
            {c.cashierName} · {formatDateTime(c.submittedAt)}
          </div>
          <div className="muted">{c.receiptIds.length} receipts</div>
          <hr />
          <table>
            <tbody>
              {DENOMINATIONS.filter((d) => c.notes[d]).map((d) => (
                <tr key={d}>
                  <td>
                    ₹{d} × {c.notes[d]}
                  </td>
                  <td className="num">{formatINR(d * 100 * c.notes[d]!)}</td>
                </tr>
              ))}
              {c.coinsPaise > 0 && (
                <tr>
                  <td>Coins</td>
                  <td className="num">{formatINR(c.coinsPaise)}</td>
                </tr>
              )}
              <tr style={{ fontWeight: 700 }}>
                <td>Cash counted</td>
                <td className="num">{formatINR(c.cashCountedPaise)}</td>
              </tr>
              <tr>
                <td>System cash</td>
                <td className="num">{formatINR(c.cashSystemPaise)}</td>
              </tr>
              <tr>
                <td>Difference</td>
                <td className="num">{c.cashVariancePaise ? `${c.cashVariancePaise < 0 ? '−' : '+'}${formatINR(Math.abs(c.cashVariancePaise))}` : 'nil'}</td>
              </tr>
              {c.nonCash.map((n) => (
                <tr key={n.mode}>
                  <td>{n.label} (slip)</td>
                  <td className="num">{formatINR(n.confirmedPaise)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {c.reason && <div style={{ fontSize: 10 }}>Reason: {c.reason}</div>}
          <hr />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, marginTop: 24 }}>
            <span>Cashier</span>
            <span>Received by</span>
          </div>
        </>
      )}
    </PrintSheet>
  )
}
