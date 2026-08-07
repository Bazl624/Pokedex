import type { Condition } from './collection'

export interface GradeGuide {
  condition: Condition
  /** Image file in public/grading/. */
  image: string
  /** One-line description of the overall look. */
  summary: string
  /** Concrete things to check on the card. */
  lookFor: string[]
}

/**
 * Plain-language grading guide. Conditions and multipliers live in
 * collection.ts; this adds the human-facing description and checklist plus an
 * illustrative example image for each grade.
 */
export const GRADE_GUIDE: GradeGuide[] = [
  {
    condition: 'NM',
    image: 'nm.jpg',
    summary: 'Looks essentially new — only the most minor factory flaws, if any.',
    lookFor: [
      'Sharp, square corners with no rounding',
      'Clean edges with little to no white "whitening"',
      'Glossy, scratch-free surface',
      'Well centered borders, no bends or creases',
    ],
  },
  {
    condition: 'LP',
    image: 'lp.jpg',
    summary: 'Minor wear you only notice on close inspection. Still a nice card.',
    lookFor: [
      'Slight edge whitening on one or more sides',
      'A little softening on a corner or two',
      'A few faint surface scratches; still mostly glossy',
      'No creases or bends',
    ],
  },
  {
    condition: 'MP',
    image: 'mp.jpg',
    summary: 'Clearly played but fully intact, with moderate wear across the card.',
    lookFor: [
      'Noticeable whitening around all edges',
      'Rounded or lightly frayed corners',
      'Visible scratches/scuffs and some loss of gloss',
      'Light border wear; no major creases',
    ],
  },
  {
    condition: 'HP',
    image: 'hp.jpg',
    summary: 'Significant wear, but the card is complete and not destroyed.',
    lookFor: [
      'Heavy edge whitening all around',
      'Clearly rounded, worn corners',
      'Many scratches/scuffs; dull surface',
      'A light crease or minor bend may be present',
    ],
  },
  {
    condition: 'DMG',
    image: 'dmg.jpg',
    summary: 'Major flaws beyond normal play wear.',
    lookFor: [
      'Creases or bends across the card',
      'Tears, chips, or missing pieces',
      'Water damage, staining, or discoloration',
      'Heavy scratching, writing, or ink marks',
    ],
  },
]
