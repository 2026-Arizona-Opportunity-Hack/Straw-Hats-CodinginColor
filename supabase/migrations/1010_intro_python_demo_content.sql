-- 1010 real questions for the Intro to Python demo course (original + teachers' copies).
-- Owner: Shivraj. Data only. Append-only after merge.
--
-- The seed left these placeholders: quick questions with no code and no answer, and empty
-- warm-ups / final checks. Without answers nothing can be graded (no ✓/✗, no learning gain).
-- Answers are written into content as usual; the 1002 trigger moves them into activity_keys,
-- so students never see them. Both `items` (student player) and `questions` (course builder)
-- are filled so the builder shows the same questions. Rows that don't exist (fresh setup
-- before the seed) are simply not updated.

create function pg_temp.mcq(p_id text, p_concept text, p_prompt text, p_choices text[], p_right int)
returns jsonb language sql immutable as $$
  select jsonb_build_object('id', p_id, 'concept', p_concept, 'prompt', p_prompt,
    'choices', (select jsonb_agg(jsonb_build_object('id', chr(96 + n::int), 'label', c) order by n)
                from unnest(p_choices) with ordinality as t(c, n)),
    'answer', chr(96 + p_right))
$$;

-- Builder view of the same items: choice labels plus the right answer's index.
create function pg_temp.builder_questions(p_items jsonb) returns jsonb
language sql immutable as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'prompt', i ->> 'prompt', 'concept', i ->> 'concept',
      'choices', (select jsonb_agg(c ->> 'label' order by n) from jsonb_array_elements(i -> 'choices') with ordinality as t(c, n)),
      'answer', ascii(i ->> 'answer') - 97) order by k), '[]'::jsonb)
  from jsonb_array_elements(p_items) with ordinality as x(i, k)
$$;

create function pg_temp.set_module(p_module_title text, p_check jsonb, p_pre jsonb, p_post jsonb)
returns void language plpgsql as $$
begin
  -- Quick question: code to read, choices, right answer.
  update activities a set content = (a.content - 'questions') || p_check || jsonb_build_object(
      'questions', jsonb_build_array(jsonb_build_object(
        'prompt', p_check ->> 'prompt', 'concept', a.concept,
        'choices', (select jsonb_agg(c ->> 'label' order by n) from jsonb_array_elements(p_check -> 'choices') with ordinality as t(c, n)),
        'answer', ascii(p_check ->> 'answer') - 97)))
  from lessons l join modules m on m.id = l.module_id
  where a.lesson_id = l.id and a.type = 'check' and m.title = p_module_title
    and coalesce((select c.copied_from from courses c where c.id = m.course_id), m.course_id) = '30000000-0000-0000-0000-000000000001';

  update activities a set content = jsonb_build_object(
      'title', 'What do you already know?', 'items', p_pre, 'questions', pg_temp.builder_questions(p_pre))
  from lessons l join modules m on m.id = l.module_id
  where a.lesson_id = l.id and a.type = 'pretest' and m.title = p_module_title
    and coalesce((select c.copied_from from courses c where c.id = m.course_id), m.course_id) = '30000000-0000-0000-0000-000000000001';

  update activities a set content = jsonb_build_object(
      'title', 'Show what you learned', 'items', p_post, 'questions', pg_temp.builder_questions(p_post))
  from lessons l join modules m on m.id = l.module_id
  where a.lesson_id = l.id and a.type = 'posttest' and m.title = p_module_title
    and coalesce((select c.copied_from from courses c where c.id = m.course_id), m.course_id) = '30000000-0000-0000-0000-000000000001';
end
$$;

-- 1. Variables & Data Types
select pg_temp.set_module('Variables & Data Types',
  jsonb_build_object('prompt', 'What will this print?',
    'markdown', E'```python\na = "3"\nprint(a + a)\n```\n\nHint: the quotes make `a` text, not a number.',
    'choices', '[{"id":"a","label":"6"},{"id":"b","label":"33"},{"id":"c","label":"3"}]'::jsonb, 'answer', 'b'),
  jsonb_build_array(
    pg_temp.mcq('v1', 'variables', 'Which line stores the number 10 in a variable called score?', array['score = 10', '10 = score', 'score == 10', 'int score 10'], 1),
    pg_temp.mcq('v2', 'data types', 'What type of value is "hello"?', array['str (text)', 'int (whole number)', 'float (decimal)', 'bool (True/False)'], 1),
    pg_temp.mcq('v3', 'variables', 'x = 4, then x = x + 1. What is x now?', array['4', '5', 'x + 1', '41'], 2)),
  jsonb_build_array(
    pg_temp.mcq('v1', 'variables', 'Which is a valid Python variable name?', array['my_score', '2score', 'my-score', 'my score'], 1),
    pg_temp.mcq('v2', 'data types', 'What type of value is 3.5?', array['float (decimal)', 'int (whole number)', 'str (text)', 'bool (True/False)'], 1),
    pg_temp.mcq('v3', 'variables', 'name = "Ana". What does print("Hi " + name) show?', array['Hi Ana', 'Hi name', 'Hi + name', 'An error'], 1)));

-- 2. Making Decisions
select pg_temp.set_module('Making Decisions',
  jsonb_build_object('prompt', 'What will this print?',
    'markdown', E'```python\nage = 15\nif age >= 16:\n    print("drive")\nelse:\n    print("wait")\n```',
    'choices', '[{"id":"a","label":"drive"},{"id":"b","label":"wait"},{"id":"c","label":"Nothing"}]'::jsonb, 'answer', 'b'),
  jsonb_build_array(
    pg_temp.mcq('d1', 'comparisons', 'Which symbol checks whether two values are equal?', array['==', '=', '!=', '=>'], 1),
    pg_temp.mcq('d2', 'conditions', 'x = 7. Is (x > 5 and x < 10) True or False?', array['True', 'False'], 1),
    pg_temp.mcq('d3', 'if/else', 'Which keyword runs code when the if condition is False?', array['else', 'then', 'otherwise', 'stop'], 1)),
  jsonb_build_array(
    pg_temp.mcq('d1', 'comparisons', 'Which symbol means "not equal"?', array['!=', '==', '<>', '=!'], 1),
    pg_temp.mcq('d2', 'conditions', 'temp = 30. What does print("hot" if temp > 25 else "cool") show?', array['hot', 'cool', 'True', 'An error'], 1),
    pg_temp.mcq('d3', 'if/else', 'Which keyword checks another condition after if?', array['elif', 'elseif', 'else if', 'or'], 1)));

-- 3. Loops
select pg_temp.set_module('Loops',
  jsonb_build_object('prompt', 'How many times does this print "hi"?',
    'markdown', E'```python\nfor i in range(3):\n    print("hi")\n```',
    'choices', '[{"id":"a","label":"2"},{"id":"b","label":"3"},{"id":"c","label":"4"}]'::jsonb, 'answer', 'b'),
  jsonb_build_array(
    pg_temp.mcq('l1', 'range', 'Which numbers does range(4) give?', array['0, 1, 2, 3', '1, 2, 3, 4', '0, 1, 2, 3, 4', 'Just 4'], 1),
    pg_temp.mcq('l2', 'while loops', 'Which loop repeats as long as a condition is True?', array['while', 'for', 'repeat', 'loop'], 1),
    pg_temp.mcq('l3', 'for loops', 'total = 0, then for n in [1, 2, 3]: total = total + n. What is total?', array['6', '3', '5', '123'], 1)),
  jsonb_build_array(
    pg_temp.mcq('l1', 'range', 'How many times does for i in range(5) run?', array['5', '4', '6', '0'], 1),
    pg_temp.mcq('l2', 'while loops', 'Which word stops a loop early?', array['break', 'stop', 'exit', 'end'], 1),
    pg_temp.mcq('l3', 'for loops', 'count = 3, then while count > 0: count = count - 1. What is count after the loop?', array['0', '-1', '1', '3'], 1)));

-- 4. Functions
select pg_temp.set_module('Functions',
  jsonb_build_object('prompt', 'What will this print?',
    'markdown', E'```python\ndef greet(name):\n    return "Hi " + name\n\nprint(greet("Sam"))\n```',
    'choices', '[{"id":"a","label":"Hi Sam"},{"id":"b","label":"greet"},{"id":"c","label":"Hi name"},{"id":"d","label":"An error"}]'::jsonb, 'answer', 'a'),
  jsonb_build_array(
    pg_temp.mcq('f1', 'defining functions', 'Which keyword starts a function definition?', array['def', 'func', 'function', 'define'], 1),
    pg_temp.mcq('f2', 'return values', 'What does return do inside a function?', array['Sends a value back to where the function was called', 'Prints the value', 'Stops Python completely', 'Runs the function again'], 1),
    pg_temp.mcq('f3', 'calling functions', 'def add(a, b): return a + b. What is add(2, 3)?', array['5', '23', 'a + b', '6'], 1)),
  jsonb_build_array(
    pg_temp.mcq('f1', 'defining functions', 'In def area(w, h):, what are w and h?', array['Parameters (inputs)', 'Return values', 'Loops', 'Variables outside the function'], 1),
    pg_temp.mcq('f2', 'return values', 'def double(n): return n * 2. What is double(double(2))?', array['8', '4', '6', '16'], 1),
    pg_temp.mcq('f3', 'calling functions', 'Why do programmers write functions?', array['To reuse code instead of copying it', 'To make code run slower', 'To store numbers', 'Only for math'], 1)));
