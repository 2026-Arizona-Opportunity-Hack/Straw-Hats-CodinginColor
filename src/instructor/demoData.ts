import { LOOP_DEMO_HTML } from '../api/fixtures';
import type { Submission } from './assignments/grading';
import { newAssignment, newQuestion, type Assignment, type Block, type QuizQuestion } from './assignments/model';
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
    activities: [{ ...article, id: 'html-article', title: 'Give your page structure', markdown: 'Use an **h1** element for the page title and a **p** element for a paragraph.\n\n```html\n<h1>My first page</h1>\n<p>Welcome!</p>\n```' }, {
      ...article, id: 'cat-photo-lab', type: 'code', title: 'Build your Cat Photo App',
      markdown: 'Change the heading to Cat Photo App, introduce your cat in a paragraph, and add an alt description to the photo.',
      code: { starter: '<h1>My cat page</h1>\n<p></p>\n<img src="cat.jpg" alt="">', tests: '', solution: '',
        lab: { language: 'web', verifier: 'cat-photo-v1', starterCss: 'body { padding: 1rem; } img { max-width: 100%; }', checks: [] } },
    }],
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

const daysFromNow = (days: number) => {
  const date = new Date(Date.now() + days * 86_400_000);
  date.setHours(23, 59, 0, 0);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};

const question = (q: Partial<QuizQuestion> & Pick<QuizQuestion, 'kind'>): Block => ({ id: 'b-' + q.id, type: 'question', question: { ...newQuestion(q.kind), ...q } });

const maryvaleAssignments: Assignment[] = [
  {
    ...newAssignment('quiz'), id: 'quiz-variables', title: 'Variables quick check', published: true, moduleId: 'variables', dueAt: daysFromNow(2),
    instructions: 'Five minutes, one attempt. Answer on your own.', shuffle: true,
    blocks: [
      question({ id: 'q1', kind: 'single', prompt: 'After score = 0 and score = score + 1, what is score?', choices: ['0', '1', '2'], correct: [1] }),
      question({ id: 'q2', kind: 'truefalse', prompt: 'A variable name can start with a number.', correct: [1] }),
      question({ id: 'q3', kind: 'short', prompt: 'Which function shows a value on the screen?', accepted: ['print', 'print()'] }),
    ],
  },
  {
    ...newAssignment('link'), id: 'link-reading', title: 'Read: for loops in Python', published: true, moduleId: 'loops', dueAt: daysFromNow(4),
    instructions: 'Read the "for Statements" section, then answer the questions below.',
    blocks: [
      { id: 'b-link', type: 'link', url: 'https://docs.python.org/3/tutorial/controlflow.html#for-statements', caption: 'Python tutorial, section 4.2' },
      question({ id: 'q4', kind: 'numeric', prompt: 'How many times does the body of for i in range(5) run?', answer: 5 }),
      question({ id: 'q5', kind: 'multiple', prompt: 'Which of these can a for loop go through?', choices: ['A list', 'A string', 'A single number'], correct: [0, 1] }),
    ],
  },
  {
    ...newAssignment('html'), id: 'html-loops', title: 'Loop counter game', published: true, moduleId: 'loops', dueAt: daysFromNow(6),
    instructions: 'Play until you get it right.',
    blocks: [{ id: 'b-html', type: 'html', html: LOOP_DEMO_HTML, reportsScore: true, points: 5 }],
  },
  {
    ...newAssignment('written'), id: 'written-reflection', title: 'Reflection: where do you see loops?', moduleId: 'loops', published: true, dueAt: daysFromNow(-1),
    blocks: [
      { id: 'b-w1', type: 'written', prompt: 'Describe something in your day that repeats like a loop.', points: 5 },
      { id: 'b-w2', type: 'written', prompt: 'How would you write it as a for loop?', points: 5 },
    ],
  },
  {
    ...newAssignment('file'), id: 'file-project', title: 'Project write-up: my first program', published: true, moduleId: 'loops', dueAt: daysFromNow(3),
    instructions: 'Write one page about the program you built: what it does, how you used a loop, and what you would add next.',
    blocks: [{
      id: 'b-f1', type: 'file', prompt: 'Upload your write-up as a PDF or Word document.', fileTypes: ['pdf', 'document'], maxFiles: 1, maxSizeMb: 10, points: 15,
      rubric: [
        { id: 'r-explain', title: 'Explains the program', description: 'Says what the program does and who it is for.', ratings: [
          { id: 'r-explain-5', label: 'Clear', description: 'Anyone could understand it.', points: 5 },
          { id: 'r-explain-3', label: 'Partly clear', description: 'Some steps are missing.', points: 3 },
          { id: 'r-explain-0', label: 'Missing', description: '', points: 0 },
        ] },
        { id: 'r-loop', title: 'Uses a loop correctly', description: 'Shows the loop and explains why it repeats.', ratings: [
          { id: 'r-loop-5', label: 'Correct', description: 'Loop is shown and explained.', points: 5 },
          { id: 'r-loop-2', label: 'Attempted', description: 'Loop is shown but not explained.', points: 2 },
          { id: 'r-loop-0', label: 'Missing', description: '', points: 0 },
        ] },
        { id: 'r-next', title: 'Next steps', description: 'Names one thing to add or improve.', ratings: [
          { id: 'r-next-5', label: 'Specific', description: '', points: 5 },
          { id: 'r-next-2', label: 'Vague', description: '', points: 2 },
          { id: 'r-next-0', label: 'Missing', description: '', points: 0 },
        ] },
      ],
    }],
  },
];

// Fictional submissions so the gradebook has work to grade: some auto-graded, some waiting
// on the instructor, one late, and students who have not submitted.
const reflections = [
  ['My alarm goes off every 5 minutes until I get up.', 'for snooze in range(5): print("wake up")'],
  ['Practicing free throws: shoot, rebound, repeat.', 'for shot in range(10): shoot()'],
  ['Brushing each tooth.', ''],
];
const maryvaleSubmissions: Submission[] = learners.slice(0, 7).flatMap((learner, index) => {
  const at = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();
  const list: Submission[] = [];
  if (index !== 3) list.push({
    id: 'sub-quiz-' + index, assignmentId: 'quiz-variables', studentId: learner.id, submittedAt: at(1 + (index % 3)),
    responses: { 'b-q1': [index % 4 === 2 ? 0 : 1], 'b-q2': [index % 3 === 0 ? 0 : 1], 'b-q3': index % 2 ? 'print' : 'show' },
    manualScores: {}, rubricScores: {}, feedback: '', gradedAt: at(0),
  });
  if (index < 5) list.push({
    id: 'sub-link-' + index, assignmentId: 'link-reading', studentId: learner.id, submittedAt: at(index),
    responses: { 'b-q4': String(index === 1 ? 4 : 5), 'b-q5': index === 4 ? [0] : [0, 1] }, manualScores: {}, rubricScores: {}, feedback: '', gradedAt: null,
  });
  if (index < 3) list.push({
    id: 'sub-written-' + index, assignmentId: 'written-reflection', studentId: learner.id,
    // The last one arrives after the due date.
    submittedAt: index === 2 ? at(0) : at(2),
    responses: { 'b-w1': reflections[index][0], 'b-w2': reflections[index][1] },
    manualScores: index === 0 ? { 'b-w1': 5, 'b-w2': 4 } : {}, rubricScores: {},
    feedback: index === 0 ? 'Great real-world example. Check the indentation in your loop.' : '', gradedAt: index === 0 ? at(1) : null,
  });
  if (index < 3) list.push({
    id: 'sub-file-' + index, assignmentId: 'file-project', studentId: learner.id, submittedAt: at(index + 1),
    responses: { 'b-f1': [{ path: `demo/${learner.id}/write-up.pdf`, name: `${learner.name.split(' ')[0]}-write-up.pdf`, size: 182_000 + index * 41_000, type: 'application/pdf' }] },
    manualScores: index === 0 ? { 'b-f1': 12 } : {}, rubricScores: index === 0 ? { 'b-f1': { 'r-explain': 'r-explain-5', 'r-loop': 'r-loop-5', 'r-next': 'r-next-2' } } : {},
    feedback: index === 0 ? 'Strong explanation. Next time, name a specific feature you would add.' : '', gradedAt: index === 0 ? at(0) : null,
  });
  return list;
});

export const demoData: InstructorData = {
  courses: [Python, Web, BuilderDemo],
  staff: [
    { id: 'instructor', name: 'Demo instructor', role: 'instructor', classIds: ['maryvale', 'desert-edge'] },
    { id: 'admin', name: 'Demo program manager', role: 'admin', classIds: [] },
    { id: 'reviewer', name: 'Demo reviewer', role: 'reviewer', classIds: [] },
  ],
  classes: [
    { id: 'maryvale', name: 'Maryvale · Period 3', school: 'Maryvale High School', courseId: 'python', moduleIds: ['variables', 'loops'], joinCode: 'MARY3', learners, assignments: maryvaleAssignments, submissions: maryvaleSubmissions },
    { id: 'desert-edge', name: 'Desert Edge · After school', school: 'Desert Edge High School', courseId: 'web', moduleIds: ['html'], joinCode: 'DESRT8', assignments: [], submissions: [], learners: [
      { id: 'demo-9', name: 'Alex Reed', passcode: '880419', baseline: null, attempts: [], hints: [], lastActive: null },
      { id: 'demo-10', name: 'Noor Cruz', passcode: '880420', baseline: null, attempts: [], hints: [], lastActive: null },
    ] },
  ],
};
