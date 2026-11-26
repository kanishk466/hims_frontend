/**
 * Masters every new clinic gets at provisioning (Onboarding & Masters → Tenant provisioning, step 7):
 * value lists, a starter service list and about 60 common drugs. The admin can edit or
 * deactivate any seeded row. Real system: versioned JSON files in seeds/.
 */
import type { Drug, Service, ServiceGroup } from '@/types/masters'
import type { ValueListItem } from '@/types/valueLists'
import type { DbShape } from '../db'

type Meta = ValueListItem['meta']
type Row = [code: string, label: string, meta?: Meta, locked?: boolean]

const LISTS: Record<string, Row[]> = {
  salutation: [['MR', 'Mr'], ['MRS', 'Mrs'], ['MS', 'Ms'], ['MASTER', 'Master'], ['BABY', 'Baby'], ['DR', 'Dr']],
  gender: [['M', 'Male', {}, true], ['F', 'Female', {}, true], ['O', 'Other', {}, true]],
  maritalStatus: [['SINGLE', 'Single'], ['MARRIED', 'Married'], ['WIDOWED', 'Widowed'], ['DIVORCED', 'Divorced']],
  bloodGroup: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map((g) => [g.replace('+', 'POS').replace('-', 'NEG'), g] as Row),
  relation: [['SELF', 'Self'], ['SPOUSE', 'Spouse'], ['FATHER', 'Father'], ['MOTHER', 'Mother'], ['SON', 'Son'], ['DAUGHTER', 'Daughter'], ['GUARDIAN', 'Guardian'], ['OTHER', 'Other']],
  idProof: [['AADHAAR', 'Aadhaar'], ['PAN', 'PAN card'], ['PASSPORT', 'Passport'], ['VOTER', 'Voter ID'], ['DL', 'Driving licence'], ['ABHA', 'ABHA card']],
  patientCategory: [
    ['general', 'General', { discountPercent: 0 }, true],
    ['staff', 'Hospital staff', { discountPercent: 50 }],
    ['senior', 'Senior citizen', { discountPercent: 10 }],
    ['vip', 'VIP', { discountPercent: 0 }],
    ['bpl', 'BPL card holder', { discountPercent: 50 }],
  ],
  referralSource: [['SELF', 'Self / walk-in'], ['DOCTOR', 'Doctor referral'], ['CAMP', 'Health camp'], ['ONLINE', 'Online / Google'], ['CORP', 'Corporate tie-up'], ['FRIEND', 'Friend or family']],
  visitType: [
    ['new', 'New visit', { validityDays: 0 }, true],
    ['followUp', 'Follow-up (paid)', { validityDays: 30 }, true],
    ['freeFollowUp', 'Free follow-up', { validityDays: 7 }, true],
    ['review', 'Review with reports', { validityDays: 15 }],
    ['emergency', 'Emergency', { validityDays: 0 }],
    ['referral', 'Referral (internal)', { validityDays: 0 }, true],
  ],
  paymentMode: [
    ['cash', 'Cash', { needsReference: false }, true],
    ['upi', 'UPI', { needsReference: true }, true],
    ['card', 'Debit / credit card', { needsReference: true }],
    ['cheque', 'Cheque', { needsReference: true }],
    ['wallet', 'Wallet (Paytm, PhonePe)', { needsReference: true }],
  ],
  discountReason: [
    ['STAFF', 'Staff / family of staff', { needsApproval: false }],
    ['SENIOR', 'Senior citizen', { needsApproval: false }],
    ['CAMP', 'Health camp', { needsApproval: false }],
    ['COURTESY', 'Doctor’s courtesy', { needsApproval: true }],
    ['HARDSHIP', 'Financial hardship', { needsApproval: true }],
  ],
  cancelReason: [['WRONGPT', 'Wrong patient selected'], ['WRONGSVC', 'Wrong service billed'], ['LEFT', 'Patient left without consultation'], ['DUP', 'Duplicate bill'], ['DRNA', 'Doctor not available']],
  frequency: [
    ['OD', 'OD (once a day)', { perDay: 1 }],
    ['BD', 'BD (twice a day)', { perDay: 2 }],
    ['TDS', 'TDS (three times a day)', { perDay: 3 }],
    ['QID', 'QID (four times a day)', { perDay: 4 }],
    ['HS', 'HS (at bedtime)', { perDay: 1 }],
    ['SOS', 'SOS (when needed)', { perDay: 0 }],
    ['1-0-1', '1-0-1', { perDay: 2 }],
    ['1-1-1', '1-1-1', { perDay: 3 }],
    ['1-0-0', '1-0-0', { perDay: 1 }],
    ['0-0-1', '0-0-1', { perDay: 1 }],
    ['WEEKLY', 'Once a week', { perDay: 0 }],
  ],
  route: [['PO', 'Oral'], ['IV', 'Intravenous'], ['IM', 'Intramuscular'], ['SC', 'Subcutaneous'], ['TOP', 'Local application'], ['INH', 'Inhalation'], ['NAS', 'Nasal'], ['EYE', 'Eye'], ['EAR', 'Ear'], ['SL', 'Under the tongue'], ['PR', 'Per rectal']],
  doseUnit: [['TAB', 'tablet'], ['CAP', 'capsule'], ['ML', 'ml'], ['DROP', 'drop'], ['PUFF', 'puff'], ['SACHET', 'sachet'], ['UNIT', 'unit'], ['APP', 'application']],
  timing: [['AF', 'After food'], ['BF', 'Before food'], ['WF', 'With food'], ['ES', 'Empty stomach'], ['BT', 'At bedtime']],
  durationUnit: [['D', 'days'], ['W', 'weeks'], ['M', 'months']],
  dosageForm: ['Tablet', 'Capsule', 'Syrup', 'Suspension', 'Drops', 'Injection', 'Inhaler', 'Respules', 'Ointment', 'Cream', 'Gel', 'Lotion', 'Powder', 'Sachet', 'Nasal spray', 'Eye drops'].map(
    (f) => [f.toUpperCase().replace(/\s/g, '-').slice(0, 20), f] as Row,
  ),
  allergy: [
    ['PEN', 'Penicillin', { kind: 'drug' }],
    ['SULFA', 'Sulfa drugs', { kind: 'drug' }],
    ['NSAID', 'NSAIDs (painkillers)', { kind: 'drug' }],
    ['ASPIRIN', 'Aspirin', { kind: 'drug' }],
    ['PEANUT', 'Peanuts', { kind: 'food' }],
    ['EGG', 'Egg', { kind: 'food' }],
    ['MILK', 'Milk', { kind: 'food' }],
    ['SEAFOOD', 'Seafood', { kind: 'food' }],
    ['DUST', 'Dust', { kind: 'other' }],
    ['LATEX', 'Latex', { kind: 'other' }],
  ],
  complaint: [
    'Fever', 'Cough', 'Cold / running nose', 'Sore throat', 'Headache', 'Body ache', 'Weakness', 'Abdominal pain', 'Vomiting', 'Loose motions',
    'Burning urination', 'Breathlessness', 'Chest pain', 'Giddiness', 'Joint pain', 'Back pain', 'Skin rash', 'Itching', 'Ear pain', 'Acidity',
  ].map((c, i) => [`C${String(i + 1).padStart(2, '0')}`, c] as Row),
  panelDocument: [['EMPID', 'Employee ID card'], ['INSCARD', 'Insurance / TPA card'], ['CGHS', 'CGHS card'], ['ESIC', 'ESIC e-pehchan card'], ['REFER', 'Referral letter'], ['PREAUTH', 'Pre-authorisation letter'], ['AADHAAR', 'Aadhaar']],
}

const rs = (rupees: number) => rupees * 100

// code, name, group, rate (₹), sample type
const SERVICES: [string, string, ServiceGroup, number, string?][] = [
  ['CONS', 'OPD consultation', 'consultation', 500],
  ['REG', 'Registration / file charges', 'misc', 50],
  ['CERT', 'Medical certificate', 'misc', 100],
  ['DRESS-S', 'Dressing (small)', 'procedure', 150],
  ['DRESS-L', 'Dressing (large)', 'procedure', 300],
  ['INJ', 'Injection (IM / IV)', 'procedure', 100],
  ['NEB', 'Nebulisation', 'procedure', 200],
  ['ECG', 'ECG (12 lead)', 'procedure', 300],
  ['SUTURE', 'Suturing (minor)', 'procedure', 500],
  ['POP', 'Plaster of Paris application', 'procedure', 1200],
  ['CBC', 'Complete blood count (CBC)', 'investigation', 350, 'Blood'],
  ['FBS', 'Blood sugar — fasting', 'investigation', 80, 'Blood'],
  ['PPBS', 'Blood sugar — post meal', 'investigation', 80, 'Blood'],
  ['HBA1C', 'HbA1c', 'investigation', 550, 'Blood'],
  ['LIPID', 'Lipid profile', 'investigation', 650, 'Blood'],
  ['LFT', 'Liver function test (LFT)', 'investigation', 700, 'Blood'],
  ['KFT', 'Kidney function test (KFT)', 'investigation', 700, 'Blood'],
  ['TSH', 'Thyroid (TSH)', 'investigation', 400, 'Blood'],
  ['URINE-R', 'Urine routine', 'investigation', 150, 'Urine'],
  ['DENGUE', 'Dengue NS1 antigen', 'investigation', 600, 'Blood'],
  ['XR-CHEST', 'X-ray chest PA', 'investigation', 450, 'Imaging'],
  ['USG-ABD', 'USG abdomen & pelvis', 'investigation', 1200, 'Imaging'],
]

// brand, generic, strength, form, manufacturer, schedule, class, high-alert
type D = [string, string, string, string, string, Drug['schedule'], string, boolean?]
const DRUGS: D[] = [
  ['Dolo 650', 'Paracetamol', '650 mg', 'Tablet', 'Micro Labs', 'none', 'Analgesic / antipyretic'],
  ['Crocin Advance', 'Paracetamol', '500 mg', 'Tablet', 'GSK', 'none', 'Analgesic / antipyretic'],
  ['Calpol 250', 'Paracetamol', '250 mg/5 ml', 'Suspension', 'GSK', 'none', 'Analgesic / antipyretic'],
  ['Meftal-P', 'Mefenamic acid', '100 mg/5 ml', 'Suspension', 'Blue Cross', 'H', 'NSAID'],
  ['Combiflam', 'Ibuprofen + Paracetamol', '400/325 mg', 'Tablet', 'Sanofi', 'none', 'NSAID'],
  ['Zerodol-P', 'Aceclofenac + Paracetamol', '100/325 mg', 'Tablet', 'Ipca', 'H', 'NSAID'],
  ['Augmentin 625 Duo', 'Amoxicillin + Clavulanic acid', '500/125 mg', 'Tablet', 'GSK', 'H', 'Antibiotic'],
  ['Mox 500', 'Amoxicillin', '500 mg', 'Capsule', 'Sun Pharma', 'H', 'Antibiotic'],
  ['Azithral 500', 'Azithromycin', '500 mg', 'Tablet', 'Alembic', 'H', 'Antibiotic'],
  ['Azithral 200 Liquid', 'Azithromycin', '200 mg/5 ml', 'Suspension', 'Alembic', 'H', 'Antibiotic'],
  ['Taxim-O 200', 'Cefixime', '200 mg', 'Tablet', 'Alkem', 'H', 'Antibiotic'],
  ['Cifran 500', 'Ciprofloxacin', '500 mg', 'Tablet', 'Sun Pharma', 'H', 'Antibiotic'],
  ['Levoflox 500', 'Levofloxacin', '500 mg', 'Tablet', 'Cipla', 'H', 'Antibiotic'],
  ['Metrogyl 400', 'Metronidazole', '400 mg', 'Tablet', 'J B Chemicals', 'H', 'Antibiotic'],
  ['Doxy-1 L-DR Forte', 'Doxycycline', '100 mg', 'Capsule', 'USV', 'H', 'Antibiotic'],
  ['Pan 40', 'Pantoprazole', '40 mg', 'Tablet', 'Alkem', 'H', 'Proton pump inhibitor'],
  ['Pan-D', 'Pantoprazole + Domperidone', '40/30 mg', 'Capsule', 'Alkem', 'H', 'Proton pump inhibitor'],
  ['Omez 20', 'Omeprazole', '20 mg', 'Capsule', 'Dr. Reddy’s', 'H', 'Proton pump inhibitor'],
  ['Digene Gel', 'Antacid', '—', 'Suspension', 'Abbott', 'none', 'Antacid'],
  ['Ondem 4', 'Ondansetron', '4 mg', 'Tablet', 'Alkem', 'H', 'Antiemetic'],
  ['Sporlac', 'Lactic acid bacillus', '—', 'Sachet', 'Sanzyme', 'none', 'Probiotic'],
  ['Electral', 'Oral rehydration salts', 'WHO formula', 'Sachet', 'FDC', 'none', 'ORS'],
  ['Cetzine', 'Cetirizine', '10 mg', 'Tablet', 'GSK', 'none', 'Antihistamine'],
  ['Allegra 120', 'Fexofenadine', '120 mg', 'Tablet', 'Sanofi', 'H', 'Antihistamine'],
  ['Montair LC', 'Montelukast + Levocetirizine', '10/5 mg', 'Tablet', 'Cipla', 'H', 'Anti-allergic'],
  ['Ascoril LS', 'Ambroxol + Levosalbutamol + Guaifenesin', '30/1/50 mg per 5 ml', 'Syrup', 'Glenmark', 'H', 'Cough'],
  ['Grilinctus', 'Dextromethorphan + Chlorpheniramine', '—', 'Syrup', 'Franco-Indian', 'H', 'Cough'],
  ['Sinarest', 'Paracetamol + Phenylephrine + Chlorpheniramine', '—', 'Tablet', 'Centaur', 'none', 'Cold'],
  ['Otrivin', 'Xylometazoline', '0.1%', 'Nasal spray', 'GSK', 'none', 'Decongestant'],
  ['Nasivion Paediatric', 'Oxymetazoline', '0.025%', 'Drops', 'Merck', 'none', 'Decongestant'],
  ['Asthalin Inhaler', 'Salbutamol', '100 mcg/puff', 'Inhaler', 'Cipla', 'H', 'Bronchodilator'],
  ['Budecort Respules', 'Budesonide', '0.5 mg', 'Respules', 'Cipla', 'H', 'Inhaled steroid'],
  ['Deriphyllin Retard 150', 'Etofylline + Theophylline', '150 mg', 'Tablet', 'Zydus', 'H', 'Bronchodilator'],
  ['Wysolone 10', 'Prednisolone', '10 mg', 'Tablet', 'Pfizer', 'H', 'Steroid'],
  ['Glycomet 500', 'Metformin', '500 mg', 'Tablet', 'USV', 'H', 'Antidiabetic'],
  ['Glycomet GP 1', 'Metformin + Glimepiride', '500/1 mg', 'Tablet', 'USV', 'H', 'Antidiabetic', true],
  ['Januvia 100', 'Sitagliptin', '100 mg', 'Tablet', 'MSD', 'H', 'Antidiabetic'],
  ['Lantus', 'Insulin glargine', '100 IU/ml', 'Injection', 'Sanofi', 'H', 'Insulin', true],
  ['Huminsulin 30/70', 'Human insulin (premix)', '40 IU/ml', 'Injection', 'Eli Lilly', 'H', 'Insulin', true],
  ['Telma 40', 'Telmisartan', '40 mg', 'Tablet', 'Glenmark', 'H', 'Antihypertensive'],
  ['Amlong 5', 'Amlodipine', '5 mg', 'Tablet', 'Micro Labs', 'H', 'Antihypertensive'],
  ['Met XL 25', 'Metoprolol succinate', '25 mg', 'Tablet', 'Ajanta', 'H', 'Beta blocker'],
  ['Ecosprin 75', 'Aspirin', '75 mg', 'Tablet', 'USV', 'none', 'Antiplatelet'],
  ['Clopilet 75', 'Clopidogrel', '75 mg', 'Tablet', 'Sun Pharma', 'H', 'Antiplatelet'],
  ['Atorva 10', 'Atorvastatin', '10 mg', 'Tablet', 'Zydus', 'H', 'Statin'],
  ['Rosuvas 10', 'Rosuvastatin', '10 mg', 'Tablet', 'Sun Pharma', 'H', 'Statin'],
  ['Thyronorm 50', 'Levothyroxine', '50 mcg', 'Tablet', 'Abbott', 'H', 'Thyroid'],
  ['Warf 5', 'Warfarin', '5 mg', 'Tablet', 'Cipla', 'H', 'Anticoagulant', true],
  ['Shelcal 500', 'Calcium + Vitamin D3', '500 mg/250 IU', 'Tablet', 'Torrent', 'none', 'Supplement'],
  ['Uprise-D3 60K', 'Cholecalciferol', '60,000 IU', 'Capsule', 'Alkem', 'none', 'Supplement'],
  ['Neurobion Forte', 'Vitamin B complex', '—', 'Tablet', 'Merck', 'none', 'Supplement'],
  ['Becosules', 'B complex + Vitamin C', '—', 'Capsule', 'Pfizer', 'none', 'Supplement'],
  ['Zincovit', 'Multivitamin + Zinc', '—', 'Tablet', 'Apex', 'none', 'Supplement'],
  ['Livogen', 'Ferrous fumarate + Folic acid', '152/1.5 mg', 'Tablet', 'Merck', 'none', 'Iron'],
  ['Folvite 5', 'Folic acid', '5 mg', 'Tablet', 'Pfizer', 'none', 'Supplement'],
  ['Volini Gel', 'Diclofenac', '1%', 'Gel', 'Sun Pharma', 'none', 'Topical NSAID'],
  ['Betadine Ointment', 'Povidone iodine', '5%', 'Ointment', 'Win-Medicare', 'none', 'Antiseptic'],
  ['Soframycin', 'Framycetin', '1%', 'Cream', 'Sanofi', 'none', 'Topical antibiotic'],
  ['Fucidin', 'Fusidic acid', '2%', 'Cream', 'Leo Pharma', 'H', 'Topical antibiotic'],
  ['Candid', 'Clotrimazole', '1%', 'Cream', 'Glenmark', 'none', 'Antifungal'],
  ['Moxicip', 'Moxifloxacin', '0.5%', 'Eye drops', 'Cipla', 'H', 'Antibiotic eye drops'],
  ['Alprax 0.25', 'Alprazolam', '0.25 mg', 'Tablet', 'Torrent', 'H1', 'Benzodiazepine', true],
  ['Tramazac 50', 'Tramadol', '50 mg', 'Capsule', 'Zydus', 'H1', 'Opioid analgesic', true],
]

export function seedClinicMasters(db: DbShape, clinicId: string, now: Date) {
  const at = now.toISOString()

  for (const [type, rows] of Object.entries(LISTS)) {
    rows.forEach(([code, label, meta = {}, locked = false], i) =>
      db.valueListItems.push({ id: `vl-${clinicId}-${type}-${code}`, clinicId, type, code, label, meta, sortOrder: i + 1, active: true, locked }),
    )
  }

  for (const [code, name, group, rate, sampleType] of SERVICES) {
    const s: Service = {
      id: `svc-${clinicId}-${code.toLowerCase()}`,
      clinicId,
      code,
      name,
      group,
      departmentId: null,
      defaultRatePaise: rs(rate),
      gstPercent: 0,
      sac: group === 'investigation' || group === 'consultation' || group === 'procedure' ? '999316' : '999319',
      openPrice: code.startsWith('DRESS'),
      sampleType: sampleType ?? null,
      auto: code === 'CONS' || undefined,
      active: true,
      createdAt: at,
      updatedAt: at,
    }
    db.services.push(s)
  }
  // Health package: example of a package made of other services.
  const ids = (codes: string[]) => codes.map((c) => `svc-${clinicId}-${c.toLowerCase()}`)
  db.services.push({
    id: `svc-${clinicId}-pkg-basic`,
    clinicId,
    code: 'PKG-BASIC',
    name: 'Basic health check-up',
    group: 'package',
    departmentId: null,
    defaultRatePaise: rs(1499),
    gstPercent: 0,
    sac: '999316',
    openPrice: false,
    includedServiceIds: ids(['CONS', 'CBC', 'FBS', 'LIPID', 'URINE-R', 'ECG']),
    active: true,
    createdAt: at,
    updatedAt: at,
  })

  DRUGS.forEach(([brand, generic, strength, form, manufacturer, schedule, drugClass, highAlert = false], i) =>
    db.drugs.push({
      id: `drug-${clinicId}-${i + 1}`,
      clinicId,
      brand,
      generic,
      strength,
      form: form.toUpperCase().replace(/\s/g, '-').slice(0, 20),
      manufacturer,
      drugClass,
      schedule,
      highAlert,
      active: true,
      createdAt: at,
      updatedAt: at,
    }),
  )

  seedRxTemplates(db, clinicId)
}

/** Shared prescription templates (OPD-08: "Viral fever adult"…), built from the seeded drugs. */
function seedRxTemplates(db: DbShape, clinicId: string) {
  const drug = (brand: string) => db.drugs.find((d) => d.clinicId === clinicId && d.brand === brand)!
  const item = (brand: string, dose: string, frequency: string, timing: string, duration: number, durationUnit: 'D' | 'W' | 'M' = 'D', instructions?: string) => {
    const d = drug(brand)
    return { drugId: d.id, brand: d.brand, generic: d.generic, strength: d.strength, form: d.form, dose, frequency, route: 'PO', timing, duration, durationUnit, instructions }
  }
  const t = (key: string, name: string, complaints: string[], diagnoses: [string, string][], rx: ReturnType<typeof item>[], advice: string) =>
    db.rxTemplates.push({ id: `rxt-${clinicId}-${key}`, clinicId, name, doctorId: null, complaints, diagnoses: diagnoses.map(([code, n]) => ({ code, name: n, type: 'provisional' as const })), rx, advice })
  t('fever', 'Viral fever (adult)', ['Fever', 'Body ache', 'Headache'], [['B34.9', 'Viral infection, unspecified']], [item('Dolo 650', '1', 'TDS', 'AF', 3, 'D', 'Only if temperature above 100°F'), item('Cetzine', '1', 'HS', 'AF', 5)], 'Plenty of fluids, rest. Come back if fever lasts more than 3 days.')
  t('age', 'Acute gastroenteritis (adult)', ['Loose motions', 'Vomiting', 'Abdominal pain'], [['A09', 'Infectious gastroenteritis and colitis, unspecified']], [item('Electral', '1', 'TDS', 'AF', 3, 'D', '1 sachet in 1 litre water, sip through the day'), item('Ondem 4', '1', 'SOS', 'BF', 2), item('Sporlac', '1', 'BD', 'AF', 5)], 'Light diet, boiled water. Watch for less urine or drowsiness.')
  t('urti-child', 'URTI (child)', ['Cough', 'Cold / running nose', 'Fever'], [['J06.9', 'Acute upper respiratory infection, unspecified']], [item('Calpol 250', '5 ml', 'TDS', 'AF', 3, 'D', 'Only if fever'), item('Nasivion Paediatric', '1 drop', 'BD', 'AF', 5)], 'Steam inhalation, warm fluids.')
  t('htn', 'Hypertension review', ['Headache', 'Giddiness'], [['I10', 'Essential (primary) hypertension']], [item('Telma 40', '1', 'OD', 'AF', 1, 'M'), item('Amlong 5', '1', 'OD', 'AF', 1, 'M')], 'Salt under 5 g a day, walk 30 minutes daily. BP chart at home.')
  t('dm', 'Type 2 diabetes review', ['Weakness'], [['E11.9', 'Type 2 diabetes mellitus without complications']], [item('Glycomet 500', '1', 'BD', 'AF', 1, 'M'), item('Atorva 10', '1', 'HS', 'AF', 1, 'M')], 'Diet chart given. Fasting and post-meal sugar before next visit.')
  t('rhinitis', 'Allergic rhinitis', ['Cold / running nose', 'Itching'], [['J30.4', 'Allergic rhinitis, unspecified']], [item('Montair LC', '1', 'HS', 'AF', 10)], 'Avoid dust; mask while cleaning.')
}

/** Id of the system consultation service of a clinic. */
export const consultationServiceId = (clinicId: string) => `svc-${clinicId}-cons`
