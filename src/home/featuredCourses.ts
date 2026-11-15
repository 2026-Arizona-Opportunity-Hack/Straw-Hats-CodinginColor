export const featuredCourses = [
  {
    key: 'ai-academy',
    title: 'AI Academy',
    subject: 'Artificial intelligence',
    catalogSearch: 'AI Academy',
    logo: '/languages/ai.svg',
    description: 'Find out what counts as AI, how computers use information, and where the tools you see every day can help or get things wrong.',
    project: 'Try it: investigate an AI tool and test what it can do.',
  },
  {
    key: 'web-development',
    title: 'Responsive Web Development',
    subject: 'HTML & CSS',
    catalogSearch: 'Web Development',
    logo: '/languages/html5.svg',
    description: 'Start with HTML, the building blocks of a web page. Add headings, links, and images, then run your own code and check how it looks.',
    project: 'First project: build a Cat Photo App.',
  },
] as const

/** Public entry points can continue only to these catalog searches after sign-in. */
export function featuredCoursePath(key: string | null): string | null {
  const course = featuredCourses.find(entry => entry.key === key)
  return course ? '/student/explore?' + new URLSearchParams({ search: course.catalogSearch }).toString() : null
}
