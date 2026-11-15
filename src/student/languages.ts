// Owner: Jacky. One logo and colour per language, used on every card for it. Worked out from the
// course title, so the database needs nothing extra. Logos: public/languages (see LICENSE.md there).
export interface Language {
  key: string
  logo: string
  /** Accent for text, progress and borders. */
  hue: string
  /** Soft background behind the logo. */
  tint: string
}

const LANGUAGES: (Language & { match: RegExp })[] = [
  { match: /python/i, key: 'Python', logo: '/languages/python.svg', hue: '#2b5b9e', tint: '#eaf1fb' },
  { match: /javascript/i, key: 'JavaScript', logo: '/languages/javascript.svg', hue: '#8a6a00', tint: '#fff8d6' },
  { match: /html|web page/i, key: 'HTML', logo: '/languages/html5.svg', hue: '#c7401f', tint: '#fdede7' },
  { match: /css/i, key: 'CSS', logo: '/languages/css3.svg', hue: '#1f5fbf', tint: '#e8f0fd' },
  { match: /java\b/i, key: 'Java', logo: '/languages/java.svg', hue: '#b0372a', tint: '#fcece9' },
  { match: /c\+\+|cpp/i, key: 'C++', logo: '/languages/cplusplus.svg', hue: '#00599c', tint: '#e6f0f8' },
  { match: /\bsql\b|database/i, key: 'SQL', logo: '/languages/sql.svg', hue: '#1e5f91', tint: '#e7f2fb' },
  { match: /\bai\b|machine learning/i, key: 'AI', logo: '/languages/ai.svg', hue: '#5b3cc4', tint: '#f1edfd' },
]

const OTHER: Language = { key: 'Coding', logo: '/languages/ai.svg', hue: '#007a3d', tint: '#e6f4ed' }

export const ALL_LANGUAGES: Language[] = LANGUAGES

export function languageOf(title: string): Language {
  return LANGUAGES.find((l) => l.match.test(title)) ?? OTHER
}
