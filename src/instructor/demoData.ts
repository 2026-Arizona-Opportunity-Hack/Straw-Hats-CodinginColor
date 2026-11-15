import type { Activity, Course, InstructorData, Learner } from './model';

const article: Activity = {
  id: 'variables-article', type: 'content', title: 'Give values a name', url: '', questions: [],
  markdown: [
    'A variable is a name that points to a value. Give it a name you can understand when you come back to your code.',
    '## Try an example',
    'Imagine you’re keeping score in a game. Start by giving the score a name.',
    '```python\nscore = 0\nscore = score + 1\nprint(score)\n```',
    'The last line prints **1**. Python uses the value of score on the right, adds one, and stores the result back in score.',
  ].join('\n\n'),
};
const check: Activity = {
  id: 'variables-check', type: 'check', title: 'Check your understanding', url: '', markdown: '',
  questions: [{ prompt: 'What does print(score) show after the second line?', choices: ['0', '1', '2'], answer: 1, concept: 'Variables' }],
};
const Python: Course = {
  id: 'python', title: 'Introduction to Python', level: 'Beginner',
  description: 'Write your first programs and practice variables, conditionals, and loops.',
  modules: [
    {
      id: 'variables', title: 'Variables and values', published: true, lessons: [{
        id: 'variables-lesson', title: 'Keep score with variables', activities: [
          { ...check, id: 'variables-pretest', type: 'pretest', title: 'Before you begin' },
          article, check,
          { ...article, id: 'variables-code', type: 'code', title: 'Build a score counter', markdown: 'Start at 0 and add 3 points. Print the new score.\n\n```python\nscore = 0\n# Add your code below\n```' },
          { ...check, id: 'variables-posttest', type: 'posttest', title: 'Show what you learned' },
          { ...check, id: 'variables-exit', type: 'exit', title: 'Exit question', questions: [{ prompt: 'How would you name a variable for the number of lives left?', choices: [], answer: null, concept: 'Variables' }] },
        ],
      }],
    },
    {
      id: 'loops', title: 'Repeat with loops', published: true, lessons: [{
        id: 'loops-lesson', title: 'Run a block more than once', activities: [
          { ...article, id: 'loops-article', title: 'Repeat an action', markdown: 'A loop repeats a block of code. A **for loop** is handy when you know how many times to repeat.\n\n```python\nfor i in range(3):\n    print(i)\n```\n\nThis prints 0, 1, and 2.' },
          { ...check, id: 'loops-check', questions: [{ prompt: 'How many times does range(3) run?', choices: ['Two', 'Three', 'Four'], answer: 1, concept: 'Loops' }] },
        ],
      }],
    },
    { id: 'functions', title: 'Write a reusable function', published: false, lessons: [] },
  ],
};
const Web: Course = {
  id: 'web', title: 'Build your first web page', level: 'Beginner',
  description: 'Create a simple webpage with HTML.',
  modules: [{ id: 'html', title: 'HTML foundations', published: true, lessons: [{
    id: 'html-lesson', title: 'Headings and paragraphs',
    activities: [{ ...article, id: 'html-article', title: 'Give your page structure', markdown: 'Use an **h1** element for the page title and a **p** element for a paragraph.\n\n```html\n<h1>My first page</h1>\n<p>Welcome!</p>\n```' }],
  }] }],
};
export const BuilderDemo: Course = {
  id: 'builder-demo', title: 'Try the curriculum builder', description: 'Practice with quizzes, a custom activity, and two coding labs.', level: 'Beginner',
  modules: [{
    id: 'builder-demo-module', title: 'Make a score counter', published: true, revision: 1,
    lessons: [{
      id: 'builder-demo-lesson', title: 'From a variable to a web page', activities: [
        { ...check, id: 'builder-quiz', title: 'Quick quiz' },
        { ...check, id: 'builder-reflection', type: 'worksheet', title: 'In your own words', format: 'open-ended',
          questions: [{ prompt: 'Where could a scoreboard be useful?', choices: [], answer: null, concept: 'Variables' }] },
        { ...article, id: 'builder-widget', type: 'interactive_html', title: 'Try the score widget', markdown: '', interactiveHtml: {
          reports_score: true,
          instructions: 'Add a point. The widget will report completion.',
          html: '<!doctype html><html lang="en"><title>Score widget</title><p>Score: <output id="score">0</output></p><button id="add">Add a point</button><script>document.querySelector("#add").addEventListener("click", () => { document.querySelector("#score").textContent = "1"; parent.postMessage({ type: "cic:complete", score: 1 }, "*"); });</script></html>',
        } },
        { ...article, id: 'builder-python', type: 'code', title: 'Python lab', markdown: 'Print the updated score. The output should be 3.',
          code: { starter: 'score = 1\nprint(score)\n', tests: '', solution: '',
            lab: { language: 'python', checks: [{ name: 'Print the updated score', expected: '3' }] } } },
        { ...article, id: 'builder-web', type: 'code', title: 'Web lab', markdown: 'Add a level-one heading that says Scoreboard.',
          code: { starter: '<main><p>Score: 3</p></main>', tests: '', solution: '',
            lab: { language: 'web', starterCss: 'main { padding: 16px; }', checks: [{ name: 'Scoreboard heading', selector: 'main h1', expected: 'Scoreboard' }] } } },
      ],
    }],
  }],
};
const names = ['Sofía Rivera', 'Mateo Hill', 'Amina Brooks', 'Jordan Vega', 'Priya Nair', 'Camila Moreno', 'Ellis Chen', 'Nico Flores'];
const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();
const learners: Learner[] = names.map((name, index) => {
  const completedCount = [8, 5, 3, 0, 8, 5, 2, 0][index];
  const activities = Python.modules.slice(0, 2).flatMap(module => module.lessons.flatMap(lesson => lesson.activities));
  return {
    id: 'demo-' + index, name, passcode: String(880411 + index),
    baseline: completedCount > 0 ? 40 + index * 3 : null,
    lastActive: completedCount > 0 ? daysAgo(index === 2 ? 6 : 1) : null,
    attempts: activities.slice(0, completedCount).map((activity, position) => ({
      activityId: activity.id,
      minutes: [4, 8, 3, 12, 5, 2, 7, 3][position],
      submitted: true,
      score: ['content', 'exit'].includes(activity.type) ? null
        : activity.type === 'pretest' ? 40 + index * 3
        : (index === 2 && position === 2) || (index === 0 && activity.id === 'loops-check') ? 33 : 88 - index * 3,
      count: index === 2 && position === 2 ? 3 : 1,
      response: activity.type === 'code' ? 'score = 0\nscore += 3\nprint(score)' : undefined,
    })),
    hints: index === 2 ? [{ concept: 'Variables', text: 'Which value does score hold right before print runs?' }] : [],
  };
});

export const demoData: InstructorData = {
  courses: [Python, Web, BuilderDemo],
  staff: [
    { id: 'instructor', name: 'Demo instructor', role: 'instructor', classIds: ['maryvale', 'desert-edge'] },
    { id: 'admin', name: 'Demo program manager', role: 'admin', classIds: [] },
    { id: 'reviewer', name: 'Demo reviewer', role: 'reviewer', classIds: [] },
  ],
  classes: [
    { id: 'maryvale', name: 'Maryvale · Period 3', school: 'Maryvale High School', courseId: 'python', moduleIds: ['variables', 'loops'], joinCode: 'MARY3', learners },
    { id: 'desert-edge', name: 'Desert Edge · After school', school: 'Desert Edge High School', courseId: 'web', moduleIds: ['html'], joinCode: 'DESRT8', learners: [
      { id: 'demo-9', name: 'Alex Reed', passcode: '880419', baseline: null, attempts: [], hints: [], lastActive: null },
      { id: 'demo-10', name: 'Noor Cruz', passcode: '880420', baseline: null, attempts: [], hints: [], lastActive: null },
    ] },
  ],
};
