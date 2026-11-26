import { Alert, Badge, Button, Card, Chip, Collapse, Grid, Group, Loader, Menu, Modal, Select, Stack, Text, Textarea, TextInput, Title } from '@mantine/core'
import { DatePickerInput } from '@mantine/dates'
import { useHotkeys } from '@mantine/hooks'
import { IconArrowLeft, IconCheck, IconChevronDown, IconCopy, IconDeviceFloppy, IconPrinter, IconShare, IconTemplate } from '@tabler/icons-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import type { Consultation } from '@/api/emr'
import { isApiError } from '@/api/client'
import { Can } from '@/auth/Can'
import { useCan } from '@/auth/useCan'
import { notifySaved, showApiError } from '@/lib/apiErrors'
import { addDays, formatDateTime, formatDay, formatTime } from '@/lib/dates'
import type { NoteContent } from '@/types/opd'
import { useDoctors, useValueList } from '../../masters/queries'
import { useAddAddendum, useCallVisit, useCompleteConsultation, useConsultation, useReferVisit, useSaveNote, useSaveRxTemplate } from '../queries'
import { MlcBadge } from '../MlcBadge'
import { VisitFlow } from '../VisitFlow'
import { VisitStatusBadge } from '../VisitStatusBadge'
import { DiagnosisInput } from './DiagnosisInput'
import { OrdersCard } from './OrdersCard'
import { PatientSummary } from './PatientSummary'
import { RxEditor } from './RxEditor'

const AUTOSAVE_MS = 30_000

/** OPD Spec screen 8: one page for the whole consultation. */
export function ConsultationPage() {
  const { visitId } = useParams()
  const { data: c, isLoading, error } = useConsultation(visitId)
  if (isLoading) return <Loader m="xl" />
  if (error || !c) return <Alert color="red">{isApiError(error) ? error.message : 'Could not open the consultation.'}</Alert>
  // Remount when the note is locked so the read-only view starts clean.
  return <ConsultationView key={`${c.visit.id}-${c.note.lockedAt ?? 'open'}`} c={c} />
}

const toYmd = (d: Date | string | null) =>
  d ? (typeof d === 'string' ? d.slice(0, 10) : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`) : null

function contentOf(n: NoteContent): NoteContent {
  const { complaints, complaintText, hpi, pastHistory, familyHistory, personalHistory, examination, diagnoses, advice, followUpDate, rx } = n
  return {
    complaints,
    complaintText,
    hpi,
    pastHistory,
    familyHistory,
    personalHistory,
    examination,
    diagnoses,
    advice,
    followUpDate,
    rx,
  }
}

function ConsultationView({ c }: { c: Consultation }) {
  const navigate = useNavigate()
  const locked = !!c.note.lockedAt
  const canEdit = useCan('opd.workbench.edit') && !locked
  const [note, setNote] = useState<NoteContent>(() => contentOf(c.note))
  const [savedAt, setSavedAt] = useState<string | null>(c.note.updatedAt || null)
  const [diagError, setDiagError] = useState<string>()
  const [moreHistory, setMoreHistory] = useState(!!(c.note.pastHistory || c.note.familyHistory || c.note.personalHistory))
  const [templateOpen, setTemplateOpen] = useState(false)
  const [referOpen, setReferOpen] = useState(false)
  const dirty = useRef(false)
  const latest = useRef(note)
  const save = useSaveNote()
  const complete = useCompleteConsultation()
  const call = useCallVisit()
  const { data: complaintList } = useValueList('complaint')
  const visitId = c.visit.id
  const waiting = ['checkedIn', 'billed', 'vitalsDone'].includes(c.visit.status)

  const set = <K extends keyof NoteContent>(k: K, v: NoteContent[K]) => {
    dirty.current = true
    setNote((n) => {
      const next = { ...n, [k]: v }
      latest.current = next
      return next
    })
  }
  const merge = (patch: Partial<NoteContent>) => {
    dirty.current = true
    setNote((n) => {
      const next = { ...n, ...patch }
      latest.current = next
      return next
    })
  }

  const saveNow = useCallback(
    (quiet: boolean) => {
      if (!canEdit || !dirty.current) return
      dirty.current = false
      save.mutate(
        { visitId, content: latest.current },
        {
          onSuccess: (n) => setSavedAt(n.updatedAt),
          onError: (e) => {
            dirty.current = true
            if (!quiet) showApiError(e)
          },
        },
      )
    },
    // save.mutate is stable
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [canEdit, visitId],
  )

  // Auto-save every 30 s, and once more when the doctor leaves the page.
  useEffect(() => {
    const t = setInterval(() => saveNow(true), AUTOSAVE_MS)
    return () => {
      clearInterval(t)
      saveNow(true)
    }
  }, [saveNow])

  const completeAndPrint = () => {
    if (!note.diagnoses.length) {
      setDiagError('Add at least one diagnosis')
      document.getElementById('section-diagnosis')?.scrollIntoView({ behavior: 'smooth' })
      return
    }
    dirty.current = false
    complete.mutate(
      { visitId, content: note },
      {
        onSuccess: () => {
          notifySaved('Consultation completed')
          navigate(`/print/rx/${visitId}?autoprint=1&back=/opd/workbench`)
        },
        onError: (e) => {
          dirty.current = true
          showApiError(e)
        },
      },
    )
  }

  useHotkeys(
    [
      ['mod+S', () => saveNow(false)],
      ['mod+Enter', () => canEdit && c.visit.status === 'inConsultation' && completeAndPrint()],
    ],
    [],
  )

  const copyLast = () => {
    const l = c.lastNote
    if (!l) return
    merge({
      diagnoses: l.diagnoses,
      rx: l.rx,
      advice: note.advice || l.advice,
      pastHistory: note.pastHistory || l.pastHistory,
      familyHistory: note.familyHistory || l.familyHistory,
      personalHistory: note.personalHistory || l.personalHistory,
    })
    notifySaved(`Copied diagnosis and prescription from ${formatDay(l.date)}`)
  }
  const applyTemplate = (id: string) => {
    const t = c.templates.find((x) => x.id === id)
    if (!t) return
    merge({
      complaints: [...new Set([...note.complaints, ...t.complaints])],
      diagnoses: [...note.diagnoses, ...t.diagnoses.filter((d) => !note.diagnoses.some((x) => x.code === d.code))],
      rx: [...note.rx, ...t.rx.filter((r) => !note.rx.some((x) => x.drugId === r.drugId))],
      advice: note.advice || t.advice,
    })
  }
  const followUp = (days: number) => set('followUpDate', addDays(c.visit.date, days))

  return (
    <Stack gap="md">
      <Group justify="space-between" wrap="wrap">
        <Group gap="sm">
          <Button component={Link} to="/opd/workbench" variant="subtle" leftSection={<IconArrowLeft size={16} />} px="xs">
            Queue
          </Button>
          <Title order={3}>
            {c.visit.token} · {c.patient.name}
          </Title>
          <VisitStatusBadge status={c.visit.status} />
          <MlcBadge mlc={c.visit.mlc} />
          {!c.visit.consultPaid && !c.visit.waiveConsultation && (
            <Badge color="red" variant="light">
              consultation not paid
            </Badge>
          )}
        </Group>
        <Group gap="xs">
          {canEdit && (
            <Text size="xs" c="dimmed">
              {save.isPending ? 'Saving…' : savedAt ? `Draft saved ${formatTime(savedAt)}` : 'Not saved yet'}
            </Text>
          )}
          {canEdit && (
            <Button variant="default" leftSection={<IconDeviceFloppy size={16} />} onClick={() => saveNow(false)} title="Ctrl+S">
              Save
            </Button>
          )}
          {canEdit && !['completed', 'cancelled', 'noShow'].includes(c.visit.status) && (
            <Button variant="default" leftSection={<IconShare size={16} />} onClick={() => setReferOpen(true)}>
              Refer
            </Button>
          )}
          {canEdit && c.visit.status === 'inConsultation' && (
            <Button leftSection={<IconCheck size={16} />} onClick={completeAndPrint} loading={complete.isPending} title="Ctrl+Enter">
              Complete & print
            </Button>
          )}
          {locked && (
            <Can permission="opd.prescription.print">
              <Button leftSection={<IconPrinter size={16} />} component={Link} to={`/print/rx/${visitId}?back=/opd/workbench/${visitId}`}>
                Print prescription
              </Button>
            </Can>
          )}
        </Group>
      </Group>

      <VisitFlow visit={c.visit} here="doctor" />

      {waiting && canEdit && (
        <Alert color="blue" variant="light">
          <Group justify="space-between">
            <Text size="sm">This patient is still waiting outside. Call them in to start the consultation; you can write notes now.</Text>
            <Can permission="opd.queue.edit">
              <Button size="compact-sm" onClick={() => call.mutate(visitId, { onError: (e) => showApiError(e) })} loading={call.isPending}>
                Call in now
              </Button>
            </Can>
          </Group>
        </Alert>
      )}
      {locked && (
        <Alert color="teal" variant="light">
          Completed and locked at {formatDateTime(c.note.lockedAt!)}. To correct or add something, write an addendum below.
        </Alert>
      )}

      <Grid gap="md">
        <Grid.Col span={{ base: 12, md: 3 }}>
          <PatientSummary c={c} />
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 9 }}>
          <Stack gap="md">
            <Section title="Complaints">
              <Chip.Group multiple value={note.complaints} onChange={(v) => canEdit && set('complaints', v)}>
                <Group gap={6}>
                  {(complaintList ?? [])
                    .filter((x) => canEdit || note.complaints.includes(x.label))
                    .map((x) => (
                      <Chip key={x.code} value={x.label} size="xs">
                        {x.label}
                      </Chip>
                    ))}
                  {note.complaints
                    .filter((x) => !complaintList?.some((l) => l.label === x))
                    .map((x) => (
                      <Chip key={x} value={x} size="xs">
                        {x}
                      </Chip>
                    ))}
                </Group>
              </Chip.Group>
              <Textarea
                mt="sm"
                autosize
                minRows={1}
                placeholder="Details: since when, how severe (e.g. fever 3 days, high grade, with chills)"
                aria-label="Complaint details"
                value={note.complaintText}
                readOnly={!canEdit}
                onChange={(e) => set('complaintText', e.currentTarget.value)}
              />
            </Section>

            {(canEdit || note.hpi || note.pastHistory || note.familyHistory || note.personalHistory) && (
              <Section
                title="History"
                right={
                  <Button variant="subtle" size="compact-xs" rightSection={<IconChevronDown size={14} />} onClick={() => setMoreHistory((x) => !x)}>
                    {moreHistory ? 'Less' : 'Past, family, personal'}
                  </Button>
                }
              >
                <Textarea autosize minRows={2} label="History of present illness" value={note.hpi} readOnly={!canEdit} onChange={(e) => set('hpi', e.currentTarget.value)} />
                <Collapse expanded={moreHistory}>
                  <Stack gap="xs" mt="xs">
                    <Textarea
                      autosize
                      minRows={1}
                      label="Past history"
                      placeholder="Illnesses, operations, admissions"
                      value={note.pastHistory}
                      readOnly={!canEdit}
                      onChange={(e) => set('pastHistory', e.currentTarget.value)}
                    />
                    <Textarea autosize minRows={1} label="Family history" value={note.familyHistory} readOnly={!canEdit} onChange={(e) => set('familyHistory', e.currentTarget.value)} />
                    <Textarea
                      autosize
                      minRows={1}
                      label="Personal history"
                      placeholder="Smoking, alcohol, diet, sleep"
                      value={note.personalHistory}
                      readOnly={!canEdit}
                      onChange={(e) => set('personalHistory', e.currentTarget.value)}
                    />
                  </Stack>
                </Collapse>
              </Section>
            )}

            <Section title="Examination">
              <Textarea
                autosize
                minRows={2}
                placeholder="General and systemic examination findings"
                aria-label="Examination"
                value={note.examination}
                readOnly={!canEdit}
                onChange={(e) => set('examination', e.currentTarget.value)}
              />
            </Section>

            <Section title="Diagnosis" id="section-diagnosis">
              <DiagnosisInput
                value={note.diagnoses}
                readOnly={!canEdit}
                error={diagError}
                onChange={(d) => {
                  setDiagError(undefined)
                  set('diagnoses', d)
                }}
              />
            </Section>

            <Section
              title="Prescription"
              right={
                canEdit && (
                  <Group gap={6}>
                    {c.lastNote && (
                      <Button
                        size="compact-sm"
                        variant="subtle"
                        leftSection={<IconCopy size={14} />}
                        onClick={copyLast}
                        title={`Diagnosis and drugs from ${formatDay(c.lastNote.date)} (${c.lastNote.doctorName})`}
                      >
                        Repeat last visit
                      </Button>
                    )}
                    <Menu position="bottom-end" withinPortal>
                      <Menu.Target>
                        <Button size="compact-sm" variant="subtle" leftSection={<IconTemplate size={14} />} rightSection={<IconChevronDown size={14} />}>
                          Templates
                        </Button>
                      </Menu.Target>
                      <Menu.Dropdown>
                        {c.templates.map((t) => (
                          <Menu.Item key={t.id} onClick={() => applyTemplate(t.id)}>
                            {t.name}
                            {t.doctorId && (
                              <Text span size="xs" c="dimmed">
                                {' '}
                                · mine
                              </Text>
                            )}
                          </Menu.Item>
                        ))}
                        <Can permission="opd.prescription.create">
                          <Menu.Divider />
                          <Menu.Item disabled={!note.rx.length} onClick={() => setTemplateOpen(true)}>
                            Save this prescription as a template…
                          </Menu.Item>
                        </Can>
                      </Menu.Dropdown>
                    </Menu>
                  </Group>
                )
              }
            >
              <RxEditor value={note.rx} onChange={(rx) => set('rx', rx)} allergies={c.patient.allergies} readOnly={!canEdit} />
            </Section>

            <Section title="Tests & procedures">
              <OrdersCard c={c} />
            </Section>

            <Section title="Advice & follow-up">
              <Textarea
                autosize
                minRows={2}
                placeholder="Diet, rest, warning signs: printed on the prescription"
                aria-label="Advice"
                value={note.advice}
                readOnly={!canEdit}
                onChange={(e) => set('advice', e.currentTarget.value)}
              />
              <Group mt="sm" gap="xs" align="flex-end">
                <DatePickerInput
                  label="Follow-up on"
                  placeholder="No follow-up"
                  valueFormat="DD-MM-YYYY"
                  clearable
                  w={170}
                  minDate={addDays(c.visit.date, 1)}
                  value={note.followUpDate}
                  readOnly={!canEdit}
                  onChange={(d) => set('followUpDate', toYmd(d))}
                />
                {canEdit &&
                  [
                    ['3 days', 3],
                    ['1 week', 7],
                    ['2 weeks', 14],
                    ['1 month', 30],
                  ].map(([l, d]) => (
                    <Button key={l} size="compact-sm" variant="light" onClick={() => followUp(d as number)}>
                      {l}
                    </Button>
                  ))}
              </Group>
            </Section>

            {locked && <Addenda c={c} />}
          </Stack>
        </Grid.Col>
      </Grid>
      <SaveTemplateModal opened={templateOpen} onClose={() => setTemplateOpen(false)} visitId={visitId} note={note} />
      <ReferModal opened={referOpen} onClose={() => setReferOpen(false)} visitId={visitId} currentDoctorId={c.visit.doctorId} />
    </Stack>
  )
}

function Section({ title, right, id, children }: { title: string; right?: React.ReactNode; id?: string; children: React.ReactNode }) {
  return (
    <Card withBorder radius="md" id={id}>
      <Group justify="space-between" mb="xs">
        <Text fw={600}>{title}</Text>
        {right}
      </Group>
      {children}
    </Card>
  )
}

function Addenda({ c }: { c: Consultation }) {
  const [text, setText] = useState('')
  const add = useAddAddendum()
  return (
    <Section title="Addenda">
      <Stack gap="xs">
        {c.note.addenda.map((a, i) => (
          <div key={i}>
            <Text size="xs" c="dimmed">
              {formatDateTime(a.at)} · {a.byName}
            </Text>
            <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>
              {a.text}
            </Text>
          </div>
        ))}
        <Can permission="opd.workbench.edit">
          <Textarea
            autosize
            minRows={2}
            placeholder="Write a correction or addition; the original note stays as it was"
            aria-label="Addendum"
            value={text}
            onChange={(e) => setText(e.currentTarget.value)}
          />
          <Group justify="flex-end">
            <Button
              size="compact-sm"
              disabled={!text.trim()}
              loading={add.isPending}
              onClick={() =>
                add.mutate(
                  { visitId: c.visit.id, text },
                  {
                    onSuccess: () => (setText(''), notifySaved('Addendum added')),
                    onError: (e) => showApiError(e),
                  },
                )
              }
            >
              Add addendum
            </Button>
          </Group>
        </Can>
      </Stack>
    </Section>
  )
}

function ReferModal({ opened, onClose, visitId, currentDoctorId }: { opened: boolean; onClose: () => void; visitId: string; currentDoctorId: string }) {
  const { data: doctors } = useDoctors()
  const [toDoctorId, setToDoctorId] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const refer = useReferVisit()
  const close = () => {
    onClose()
    setToDoctorId(null)
    setNote('')
    refer.reset()
  }
  const submit = () => {
    if (!toDoctorId) return
    refer.mutate(
      { id: visitId, input: { toDoctorId, note: note.trim() || undefined } },
      {
        onSuccess: (v) => {
          notifySaved(`Referred to a new token ${v.token} with ${v.doctorName}`)
          close()
        },
        onError: (e) => showApiError(e),
      },
    )
  }
  return (
    <Modal opened={opened} onClose={close} title="Refer to another doctor">
      <Stack>
        <Text size="sm" c="dimmed">
          Creates a new, free token for the other doctor today, linked to this visit. Your notes and prescription for this visit are unaffected.
        </Text>
        <Select
          label="Refer to"
          placeholder="Choose a doctor"
          data-autofocus
          searchable
          data={(doctors ?? []).filter((d) => d.id !== currentDoctorId).map((d) => ({ value: d.id, label: d.name }))}
          value={toDoctorId}
          onChange={setToDoctorId}
        />
        <Textarea label="Note (optional)" placeholder="Reason for the referral" value={note} onChange={(e) => setNote(e.currentTarget.value)} autosize minRows={2} maxLength={200} />
        <Group justify="flex-end">
          <Button variant="default" onClick={close}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!toDoctorId} loading={refer.isPending}>
            Refer
          </Button>
        </Group>
      </Stack>
    </Modal>
  )
}

function SaveTemplateModal({ opened, onClose, visitId, note }: { opened: boolean; onClose: () => void; visitId: string; note: NoteContent }) {
  const [name, setName] = useState('')
  const save = useSaveRxTemplate()
  const submit = () =>
    save.mutate(
      {
        visitId,
        name,
        content: {
          complaints: note.complaints,
          diagnoses: note.diagnoses,
          rx: note.rx,
          advice: note.advice,
        },
      },
      {
        onSuccess: () => {
          notifySaved(`Template "${name}" saved`)
          setName('')
          onClose()
        },
        onError: (e) => showApiError(e),
      },
    )
  return (
    <Modal opened={opened} onClose={onClose} title="Save as template">
      <form
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <Stack>
          <Text size="sm" c="dimmed">
            Saves the complaints, diagnoses, {note.rx.length} drug(s) and advice. Only you will see it in your template list.
          </Text>
          <TextInput label="Template name" placeholder="e.g. Viral fever with cough" data-autofocus value={name} onChange={(e) => setName(e.currentTarget.value)} />
          <Group justify="flex-end">
            <Button variant="default" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={!name.trim()} loading={save.isPending}>
              Save template
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  )
}
