/**
 * Common OPD ICD-10 codes (WHO ICD-10). Global reference data in the real system
 * (seeds/icd10.json, ~14,000 codes); this subset covers everyday Indian OPD work.
 */
import type { Icd10 } from '@/types/opd'

const rows: [string, string][] = [
  ['A01.0', 'Typhoid fever'], ['A09', 'Infectious gastroenteritis and colitis, unspecified'], ['A15.0', 'Tuberculosis of lung'],
  ['A90', 'Dengue fever [classical dengue]'], ['A91', 'Dengue haemorrhagic fever'], ['A92.0', 'Chikungunya virus disease'],
  ['B01.9', 'Varicella without complication'], ['B05.9', 'Measles without complication'], ['B34.9', 'Viral infection, unspecified'],
  ['B35.4', 'Tinea corporis'], ['B35.6', 'Tinea cruris'], ['B37.0', 'Candidal stomatitis'], ['B50.9', 'Plasmodium falciparum malaria, unspecified'],
  ['B54', 'Unspecified malaria'], ['B86', 'Scabies'], ['D50.9', 'Iron deficiency anaemia, unspecified'], ['D64.9', 'Anaemia, unspecified'],
  ['E03.9', 'Hypothyroidism, unspecified'], ['E05.9', 'Thyrotoxicosis, unspecified'], ['E11.9', 'Type 2 diabetes mellitus without complications'],
  ['E11.65', 'Type 2 diabetes mellitus with hyperglycaemia'], ['E55.9', 'Vitamin D deficiency, unspecified'], ['E66.9', 'Obesity, unspecified'],
  ['E78.5', 'Hyperlipidaemia, unspecified'], ['E86.0', 'Dehydration'], ['F32.9', 'Depressive episode, unspecified'], ['F41.1', 'Generalised anxiety disorder'],
  ['F51.0', 'Insomnia, nonorganic'], ['G43.9', 'Migraine, unspecified'], ['G44.2', 'Tension-type headache'], ['G47.0', 'Insomnia'],
  ['G56.0', 'Carpal tunnel syndrome'], ['H10.9', 'Conjunctivitis, unspecified'], ['H52.1', 'Myopia'], ['H60.9', 'Otitis externa, unspecified'],
  ['H61.2', 'Impacted cerumen'], ['H66.9', 'Otitis media, unspecified'], ['H81.1', 'Benign paroxysmal vertigo'], ['I10', 'Essential (primary) hypertension'],
  ['I20.9', 'Angina pectoris, unspecified'], ['I25.1', 'Atherosclerotic heart disease'], ['I48', 'Atrial fibrillation and flutter'],
  ['I50.9', 'Heart failure, unspecified'], ['I83.9', 'Varicose veins of lower extremities'], ['I84.9', 'Haemorrhoids, unspecified'],
  ['J00', 'Acute nasopharyngitis [common cold]'], ['J01.9', 'Acute sinusitis, unspecified'], ['J02.9', 'Acute pharyngitis, unspecified'],
  ['J03.9', 'Acute tonsillitis, unspecified'], ['J06.9', 'Acute upper respiratory infection, unspecified'], ['J11.1', 'Influenza with other respiratory manifestations'],
  ['J18.9', 'Pneumonia, unspecified'], ['J20.9', 'Acute bronchitis, unspecified'], ['J30.4', 'Allergic rhinitis, unspecified'],
  ['J32.9', 'Chronic sinusitis, unspecified'], ['J44.9', 'Chronic obstructive pulmonary disease, unspecified'], ['J45.9', 'Asthma, unspecified'],
  ['K02.9', 'Dental caries, unspecified'], ['K21.9', 'Gastro-oesophageal reflux disease without oesophagitis'], ['K25.9', 'Gastric ulcer'],
  ['K29.7', 'Gastritis, unspecified'], ['K30', 'Dyspepsia'], ['K35.8', 'Acute appendicitis, other and unspecified'], ['K40.9', 'Inguinal hernia'],
  ['K52.9', 'Noninfective gastroenteritis and colitis, unspecified'], ['K58.9', 'Irritable bowel syndrome without diarrhoea'], ['K59.0', 'Constipation'],
  ['K76.0', 'Fatty (change of) liver, not elsewhere classified'], ['K80.2', 'Calculus of gallbladder without cholecystitis'],
  ['L01.0', 'Impetigo'], ['L02.9', 'Cutaneous abscess, furuncle and carbuncle, unspecified'], ['L20.9', 'Atopic dermatitis, unspecified'],
  ['L23.9', 'Allergic contact dermatitis, unspecified cause'], ['L30.9', 'Dermatitis, unspecified'], ['L40.9', 'Psoriasis, unspecified'],
  ['L50.9', 'Urticaria, unspecified'], ['L70.0', 'Acne vulgaris'], ['L80', 'Vitiligo'], ['M17.9', 'Gonarthrosis (osteoarthritis of knee), unspecified'],
  ['M19.9', 'Arthrosis, unspecified'], ['M25.5', 'Pain in joint'], ['M54.2', 'Cervicalgia'], ['M54.5', 'Low back pain'], ['M54.4', 'Lumbago with sciatica'],
  ['M62.6', 'Muscle strain'], ['M75.0', 'Adhesive capsulitis of shoulder (frozen shoulder)'], ['M79.1', 'Myalgia'], ['M81.9', 'Osteoporosis, unspecified'],
  ['N18.9', 'Chronic kidney disease, unspecified'], ['N20.0', 'Calculus of kidney'], ['N39.0', 'Urinary tract infection, site not specified'],
  ['N40', 'Hyperplasia of prostate'], ['N76.0', 'Acute vaginitis'], ['N92.6', 'Irregular menstruation, unspecified'], ['N94.6', 'Dysmenorrhoea, unspecified'],
  ['N95.1', 'Menopausal and female climacteric states'], ['E28.2', 'Polycystic ovarian syndrome'], ['O21.0', 'Mild hyperemesis gravidarum'],
  ['Z34.9', 'Supervision of normal pregnancy, unspecified'], ['O24.4', 'Diabetes mellitus arising in pregnancy'], ['O13', 'Gestational hypertension'],
  ['R05', 'Cough'], ['R06.0', 'Dyspnoea'], ['R07.4', 'Chest pain, unspecified'], ['R10.4', 'Other and unspecified abdominal pain'],
  ['R11', 'Nausea and vomiting'], ['R42', 'Dizziness and giddiness'], ['R50.9', 'Fever, unspecified'], ['R51', 'Headache'],
  ['R53', 'Malaise and fatigue'], ['R63.4', 'Abnormal weight loss'], ['S00.9', 'Superficial injury of head, unspecified'],
  ['S01.9', 'Open wound of head, part unspecified'], ['S52.5', 'Fracture of lower end of radius'], ['S61.9', 'Open wound of wrist and hand'],
  ['S82.6', 'Fracture of lateral malleolus'], ['S93.4', 'Sprain and strain of ankle'], ['T14.1', 'Open wound of unspecified body region'],
  ['T78.4', 'Allergy, unspecified'], ['W54', 'Bitten or struck by dog'], ['Z00.0', 'General medical examination'],
  ['Z00.1', 'Routine child health examination'], ['Z23', 'Need for immunisation'], ['Z09', 'Follow-up examination after treatment'],
  ['Z76.0', 'Issue of repeat prescription'],
]

export const ICD10: Icd10[] = rows.map(([code, name]) => ({ code, name }))
