import { useState } from 'react';
import { readAndCheckLesson } from './lessonTemplates';
import { id, newModule, type Course } from './model';
import { Dialog } from './ui';

export function CourseCreateDialog({ onCreate, onClose }: { onCreate: (course: Course) => void; onClose: () => void }) {
  const [title, setTitle] = useState('');
  const [level, setLevel] = useState('Beginner');
  const [template, setTemplate] = useState('blank');
  return <Dialog title="Create a course" onClose={onClose}>
    <form className="ic-stack" onSubmit={event => {
      event.preventDefault();
      if (!title.trim()) return;
      const module = newModule();
      if (template === 'read-check') module.lessons = [readAndCheckLesson()];
      onCreate({ id: id(), title: title.trim(), description: '', level, modules: [module] });
    }}>
      <label>Course title<input required autoFocus value={title} maxLength={100} onChange={event => setTitle(event.target.value)} /></label>
      <label>Level<select value={level} onChange={event => setLevel(event.target.value)}>
        {['Beginner', 'Intermediate', 'Advanced', 'Expert'].map(value => <option key={value}>{value}</option>)}
      </select></label>
      <label>Start with<select value={template} onChange={event => setTemplate(event.target.value)}>
        <option value="blank">Blank lesson</option><option value="read-check">Read &amp; check</option>
      </select></label>
      <div className="ic-form-footer"><button className="ic-button ic-primary" type="submit">Create course</button></div>
    </form>
  </Dialog>;
}
