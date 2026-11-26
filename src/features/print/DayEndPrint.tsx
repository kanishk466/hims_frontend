import { useParams } from 'react-router-dom'
import { isApiError } from '@/api/client'
import { formatDateTime, formatDay } from '@/lib/dates'
import { formatINR } from '@/lib/money'
import { useDayEnd } from '../dayEnd/queries'
import { Letterhead } from './Letterhead'
import { PrintSheet } from './PrintLayout'
import { useLetterhead } from './queries'

/** A4 day-end report: collections by mode and cashier, handovers, bills, and signatures. */
export function DayEndPrint() {
  const { date = '' } = useParams()
  const { data: v, error } = useDayEnd(date, !!date)
  const { data: lh } = useLetterhead()
  const total = v?.byMode.reduce((s, m) => s + m.systemPaise, 0) ?? 0
  return (
    <PrintSheet title={`Day-end ${date}`} size="a4" ready={!!(v && lh)} error={isApiError(error) ? error.message : undefined}>
      {v && lh && (
        <>
          <Letterhead c={lh} />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <div style={{ fontSize: 16, fontWeight: 700 }}>OPD day-end report · {formatDay(date)}</div>
            <div style={{ fontWeight: 700, color: v.closed ? '#060' : '#a60' }}>{v.closed ? `CLOSED by ${v.closed.closedByName}, ${formatDateTime(v.closed.closedAt)}` : 'DAY NOT CLOSED'}</div>
          </div>
          <h4>Collections</h4>
          <table>
            <thead>
              <tr className="rule">
                <th>Mode</th>
                <th className="num">Receipts</th>
                <th className="num">Amount</th>
              </tr>
            </thead>
            <tbody>
              {v.byMode.map((m) => (
                <tr key={m.mode}>
                  <td>{m.label}</td>
                  <td className="num">{m.count}</td>
                  <td className="num">{formatINR(m.systemPaise)}</td>
                </tr>
              ))}
              <tr className="rule" style={{ fontWeight: 700 }}>
                <td>Total (after refunds of {formatINR(v.refundsPaise)})</td>
                <td />
                <td className="num">{formatINR(total)}</td>
              </tr>
            </tbody>
          </table>
          <h4>Cash handovers</h4>
          <table>
            <thead>
              <tr className="rule">
                <th>Cashier</th>
                <th>Handed over</th>
                <th className="num">System cash</th>
                <th className="num">Counted</th>
                <th className="num">Difference</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {v.cashiers.flatMap((c) =>
                c.closings.map((k) => (
                  <tr key={k.id}>
                    <td>{c.name}</td>
                    <td>
                      {formatDateTime(k.submittedAt)}
                      {k.reason ? <div className="muted">{k.reason}</div> : null}
                    </td>
                    <td className="num">{formatINR(k.cashSystemPaise)}</td>
                    <td className="num">{formatINR(k.cashCountedPaise)}</td>
                    <td className="num">{k.cashVariancePaise ? `${k.cashVariancePaise < 0 ? '−' : '+'}${formatINR(Math.abs(k.cashVariancePaise))}` : 'nil'}</td>
                    <td>
                      {k.status}
                      {k.decidedByName ? ` (${k.decidedByName})` : ''}
                    </td>
                  </tr>
                )),
              )}
              {v.cashiers
                .filter((c) => c.openCount)
                .map((c) => (
                  <tr key={`${c.userId}-open`}>
                    <td>{c.name}</td>
                    <td colSpan={5}>
                      <b>Not handed over:</b> {c.openCount} receipts, {formatINR(c.openPaise)}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
          <h4>Bills</h4>
          <table>
            <tbody>
              <tr>
                <td>Bills raised</td>
                <td className="num">{v.bills.count}</td>
                <td className="num">{formatINR(v.bills.grossPaise)}</td>
              </tr>
              <tr>
                <td>Payable by panels</td>
                <td />
                <td className="num">{formatINR(v.bills.panelPaise)}</td>
              </tr>
              <tr>
                <td>Discounts given</td>
                <td />
                <td className="num">{formatINR(v.bills.discountPaise)}</td>
              </tr>
              <tr>
                <td>Cancelled bills</td>
                <td className="num">{v.bills.cancelled}</td>
                <td className="num">{formatINR(v.bills.cancelledPaise)}</td>
              </tr>
            </tbody>
          </table>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 60, fontSize: 11 }}>
            <div>Cashier(s) signature</div>
            <div>Accounts</div>
            <div>Medical Director / Administrator</div>
          </div>
          <div className="muted" style={{ fontSize: 9, marginTop: 16 }}>
            Printed {formatDateTime(v.printedAt)}
          </div>
        </>
      )}
    </PrintSheet>
  )
}
