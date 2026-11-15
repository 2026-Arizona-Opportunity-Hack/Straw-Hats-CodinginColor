import { newActivity, newLesson } from './model';

export function readAndCheckLesson() {
  const lesson = newLesson('Read & check');
  lesson.activities = [
    {
      ...newActivity('content'),
      title: 'Read · Give a page a headline',
      markdown: 'Every web page needs a clear headline so readers know what it is about. The `<h1>` tag marks the main heading. The words between the opening and closing tags are what readers see.\n\n```html\n<h1>Meet my cat</h1>\n```\n\nTry this in your head. What headline would you give a page about your favorite animal?',
    },
    {
      ...newActivity('check'),
      title: 'Check · Pick the heading tag',
      questions: [{
        prompt: 'Which tag would you use for the main headline?',
        choices: ['<h1>', '<p>', '<img>'],
        answer: 0,
        concept: 'HTML headings',
      }],
    },
  ];
  return lesson;
}
