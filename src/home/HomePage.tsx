import { ArrowDown, ArrowRight, BookOpen, CheckCircle2, Code2, ExternalLink } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAuth } from '../shared/auth/AuthContext.tsx'
import { homePathFor } from '../shared/auth/paths.ts'
import { languageOf } from '../student/languages.ts'
import { featuredCoursePath, featuredCourses } from './featuredCourses.ts'
import './home.css'

const upcoming = [
  { label: 'JavaScript', blurb: 'Make your web pages respond to clicks and input.' },
  { label: 'Java', blurb: 'Solve problems with classes and objects.' },
  { label: 'SQL', blurb: 'Ask questions and find answers in a database.' },
  { label: 'C++', blurb: 'Practice writing programs that solve logic puzzles.' },
]

const learningSteps = [
  { icon: BookOpen, title: 'Read a short lesson', text: 'Start with an example that shows what the code does, one idea at a time.' },
  { icon: Code2, title: 'Try it in your browser', text: 'Change starter code, run it, and see what your changes do.' },
  { icon: CheckCircle2, title: 'Check what you learned', text: 'Get feedback on quick questions and coding checks as you go.' },
]

export function HomePage() {
  const { profile } = useAuth()
  const startPath = profile ? homePathFor(profile.role) : '/login?mode=signup'
  const startLabel = profile ? 'Open dashboard' : 'Sign up'

  return (
    <div className="learn-home">
      <a className="learn-skip" href="#home-content">Skip to content</a>
      <header className="learn-header">
        <div className="learn-wrap learn-nav">
          <Link to="/" className="learn-wordmark" aria-label="CIC Learn home">
            <img src="/cic-logo.png" alt="" width="38" height="38" /> CIC Learn
          </Link>
          <nav aria-label="Main navigation" className="learn-nav-links">
            <a href="#courses">Courses</a>
            <a href="#how-it-works">How it works</a>
          </nav>
          <div className="learn-auth">
            {!profile && <Link className="learn-text-link" to="/login">Log in</Link>}
            <Link className="learn-button" to={startPath}>{startLabel}</Link>
          </div>
        </div>
      </header>

      <main id="home-content" tabIndex={-1}>
        <section className="learn-hero" aria-labelledby="learn-title">
          <div className="learn-wrap learn-hero-grid">
            <div className="learn-hero-copy">
              <p className="learn-eyebrow">A learning platform by Coding in Color</p>
              <h1 id="learn-title">Learn to code.<br />Build real projects.</h1>
              <p className="learn-intro">Build your first web page or find out how AI works. Start with short lessons and hands-on projects you can do right in your browser.</p>
              <div className="learn-hero-actions">
                <a className="learn-button" href="#courses">Explore courses <ArrowDown size={18} aria-hidden="true" /></a>
                <span>No coding experience needed.</span>
              </div>
            </div>
            <div className="learn-hero-visual">
              <img className="learn-hero-photo" src="/home/cic-learn-classroom.jpg" width="1080" height="720"
                alt="Two students working together at a laptop in a classroom" fetchPriority="high" />
              <div className="learn-code-sample" aria-hidden="true">
                <span><Code2 size={16} /> index.html</span>
                <code><b>&lt;h1&gt;</b>My first web page<b>&lt;/h1&gt;</b></code>
              </div>
            </div>
          </div>
        </section>

        <section id="courses" className="learn-wrap learn-section" aria-labelledby="course-heading">
          <div className="learn-section-heading">
            <h2 id="course-heading">Pick your first course</h2>
            <p>Start on your own or learn with your class.</p>
          </div>
          <div className="learn-course-grid">
            {featuredCourses.map(course => (
              <article key={course.key} className={`learn-course learn-course--${course.key}`}>
                <div className="learn-course-art">
                  <span>{course.subject}</span>
                  <img src={course.logo} alt="" width="68" height="68" />
                </div>
                <div className="learn-course-body">
                  <h3>{course.title}</h3>
                  <p>{course.description}</p>
                  <p className="learn-project">{course.project}</p>
                  <Link className="learn-course-link" aria-label={`Explore ${course.title}`}
                    to={profile?.role === 'student' ? featuredCoursePath(course.key)! : `/login?course=${course.key}`}>
                    Explore course <ArrowRight size={18} aria-hidden="true" />
                  </Link>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section id="how-it-works" className="learn-steps" aria-labelledby="how-heading">
          <div className="learn-wrap learn-section">
            <div className="learn-section-heading"><h2 id="how-heading">How learning works</h2></div>
            <ul className="learn-steps-grid">
              {learningSteps.map(({ icon: Icon, title, text }) => (
                <li key={title}><Icon size={24} aria-hidden="true" /><h3>{title}</h3><p>{text}</p></li>
              ))}
            </ul>
          </div>
        </section>

        <section className="learn-wrap learn-section" aria-labelledby="up-next-heading">
          <div className="learn-section-heading"><h2 id="up-next-heading">Coming Soon</h2><p>More languages to explore as the catalog grows.</p></div>
          <ul className="learn-upcoming">
            {upcoming.map(({ label, blurb }) => (
              <li key={label}><img src={languageOf(label).logo} alt="" width="28" height="28" /><h3>{label}</h3><p>{blurb}</p></li>
            ))}
          </ul>
        </section>
      </main>

      <footer className="learn-footer">
        <div className="learn-wrap learn-footer-inner">
          <div>
            <Link to="/" className="learn-wordmark"><img src="/cic-logo.png" alt="" width="36" height="36" /> CIC Learn</Link>
            <p>Bringing computer science education to more students.</p>
          </div>
          <a href="https://codingincolor.net/" className="learn-course-link">About Coding in Color <ExternalLink size={15} aria-hidden="true" /></a>
        </div>
      </footer>
    </div>
  )
}
