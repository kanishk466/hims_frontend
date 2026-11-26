/** HTTP-shaped twin of the old mock logic in src/api/audit.ts (now wired to real HTTP, Stage 6f). */
import { http, type HttpHandler } from 'msw'
import { requireClinic, requirePermission } from '@/api/_server'
import { authenticateFromRequest, respond, url } from './common.js'

function formatChanges(c: { added: string[]; removed: string[] }) {
  return [...c.added.map((p) => `+ ${p}`), ...c.removed.map((p) => `− ${p}`)].join('\n')
}

export const auditHandlers: HttpHandler[] = [
  http.get(url('/admin/audit'), ({ request }) =>
    respond(() => {
      const ctx = authenticateFromRequest(request)
      requirePermission(ctx, 'admin.audit.view')
      const clinicId = requireClinic(ctx)
      const search = new URL(request.url).searchParams
      const entity = search.get('entity') ?? undefined
      const userId = search.get('userId') ?? undefined
      const q = search.get('q')?.trim().toLowerCase() || undefined
      const page = Math.max(1, Number(search.get('page') ?? 1))
      const pageSize = Number(search.get('pageSize') ?? 50)

      const rows = ctx.db.auditLog.filter(
        (a) => a.clinicId === clinicId && (!entity || a.entity === entity) && (!userId || a.userId === userId) && (!q || a.summary.toLowerCase().includes(q) || a.userName.toLowerCase().includes(q)),
      )
      const items = rows.slice((page - 1) * pageSize, page * pageSize).map(({ before: _before, after, ...rest }) => ({
        ...rest,
        details: after && typeof after === 'object' && 'added' in (after as object) ? formatChanges(after as { added: string[]; removed: string[] }) : undefined,
      }))
      return { items, total: rows.length, page, pageSize }
    }),
  ),
]
