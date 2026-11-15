import { parse } from 'parse5'
import { describe, expect, it } from 'vitest'
import { catPhotoChecks } from '../../../supabase/functions/cat-photo-check/checks'
import { catPhotoPreview } from './catPhoto'

const starter = '<h1>My cat page</h1><p></p><img src="cat.jpg" alt="">'
const pass = '<h1>Cat <em>Photo</em> App</h1><p>Mochi naps.</p><img src="cat.jpg" alt="Orange cat napping.">'

describe('Cat Photo App checks', () => {
  it('reports every starter error and marks all checks passed for a complete page', () => {
    expect(catPhotoChecks(parse(starter)).map(check => check.passed)).toEqual([false, false, false])
    expect(catPhotoChecks(parse(pass)).map(check => check.passed)).toEqual([true, true, true])
  })

  it('only grades visible page markup and supplies the included raster photo', () => {
    expect(catPhotoChecks(parse('<template>' + pass + '</template>')).map(check => check.passed)).toEqual([false, false, false])
    expect(catPhotoPreview(pass)).toContain('src="data:image/jpeg;base64,')
  })
})
