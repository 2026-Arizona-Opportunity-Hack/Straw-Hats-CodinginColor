import type { InteractiveHtmlPayload } from '../shared/types/activities.ts'

export const emptyHtml: InteractiveHtmlPayload = {
  html: '<!doctype html>\n<html lang="en">\n<head><title>Activity</title></head>\n<body>\n  <h1>My activity</h1>\n</body>\n</html>',
  reports_score: false,
}
