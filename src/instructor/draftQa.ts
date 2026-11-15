import catPhoto from '../shared/labs/cat-photo.jpg?inline'
import { compressFigureImage } from './figureImage'
import { materialDraft, type DraftQaFixture, type MaterialDraft } from './materialsDraft'

export async function localQaDraft(scenario: DraftQaFixture['scenario'], image?: File): Promise<MaterialDraft> {
  const fixture: DraftQaFixture = { scenario, src: catPhoto, alt: 'A cat resting on its side' }
  if (scenario === 'image' && image) {
    if (!['image/png', 'image/jpeg'].includes(image.type)) throw new Error('Choose a PNG or JPEG test image.')
    const source = URL.createObjectURL(image)
    try {
      fixture.src = await compressFigureImage(source)
      fixture.alt = ''
    } finally {
      URL.revokeObjectURL(source)
    }
  }
  return {
    module: materialDraft({
      moduleTitle: 'QA · Computer vision',
      references: [],
      lessons: [{
        title: 'Compare three computer vision tasks',
        article: '## Classify an image\n\nA classifier labels an entire image.\n\n## Detect an object\n\nA detector can locate a cat with a box.\n\n## Segment the pixels\n\nA mask follows the visible outline of the cat.',
        practice: [],
        exitPrompt: '',
        citationIds: [],
        knowledgeChecks: [
          { prompt: 'Which task labels the whole image?', choices: ['Classification', 'Detection'], answer: 0, afterSection: 'Classify an image' },
          { prompt: 'What shows where the cat is?', choices: ['A label for the image', 'A box around the cat'], answer: 1, afterSection: 'Detect an object' },
        ],
      }],
    }),
    fixture,
  }
}
