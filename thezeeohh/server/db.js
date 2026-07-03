const { DatabaseSync } = require('node:sqlite');
const bcrypt = require('bcryptjs');
const path = require('path');

const db = new DatabaseSync(path.join(__dirname, 'db.sqlite'));

// Enable WAL mode and foreign keys
db.exec(`PRAGMA journal_mode = WAL`);
db.exec(`PRAGMA foreign_keys = ON`);

// ─── Schema ────────────────────────────────────────────────────────────────

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'student' CHECK(role IN ('student','instructor','admin')),
    avatar_url TEXT,
    bio TEXT,
    stripe_customer_id TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS courses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    subtitle TEXT,
    description TEXT,
    instructor_id INTEGER NOT NULL REFERENCES users(id),
    price REAL NOT NULL DEFAULT 0,
    category TEXT NOT NULL,
    thumbnail_gradient TEXT DEFAULT 'linear-gradient(135deg,#6366f1,#8b5cf6)',
    video_hours REAL DEFAULT 0,
    level TEXT DEFAULT 'All Levels',
    language TEXT DEFAULT 'English',
    status TEXT DEFAULT 'published' CHECK(status IN ('draft','published')),
    student_count INTEGER DEFAULT 0,
    rating REAL DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS enrollments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    course_id INTEGER NOT NULL REFERENCES courses(id),
    stripe_session_id TEXT,
    amount_paid REAL DEFAULT 0,
    platform_fee REAL DEFAULT 0,
    instructor_payout REAL DEFAULT 0,
    progress INTEGER DEFAULT 0,
    enrolled_at TEXT DEFAULT (datetime('now')),
    UNIQUE(user_id, course_id)
  );

  CREATE TABLE IF NOT EXISTS sections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    course_id INTEGER NOT NULL REFERENCES courses(id),
    title TEXT NOT NULL,
    order_index INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS lessons (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    section_id INTEGER NOT NULL REFERENCES sections(id),
    title TEXT NOT NULL,
    duration TEXT DEFAULT '5:00',
    type TEXT DEFAULT 'video' CHECK(type IN ('video','pdf','quiz','live')),
    is_free INTEGER DEFAULT 0,
    order_index INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS instructor_applications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    specialty TEXT NOT NULL,
    bio TEXT,
    linkedin_url TEXT,
    sample_course_idea TEXT,
    status TEXT DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS newsletter_subscribers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    subscribed_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS reviews (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    course_id INTEGER NOT NULL REFERENCES courses(id),
    rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),
    comment TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(user_id, course_id)
  );

  CREATE TABLE IF NOT EXISTS foia_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    state TEXT NOT NULL,
    request_date TEXT DEFAULT (date('now')),
    status TEXT NOT NULL DEFAULT 'Pending' CHECK(status IN ('Pending', 'Fulfilled', 'Denied')),
    notes TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS docket_alerts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    docket_id TEXT UNIQUE NOT NULL,
    case_name TEXT,
    docket_number TEXT,
    court TEXT,
    state_jurisdiction TEXT NOT NULL,
    date_filed TEXT,
    url TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );
`);

// ─── Seed Data ──────────────────────────────────────────────────────────────

function seed() {
  const { count } = db.prepare('SELECT COUNT(*) as count FROM users').get();
  if (count > 0) return;

  const hash = (pw) => bcrypt.hashSync(pw, 10);

  const insertUser = db.prepare(
    'INSERT INTO users (email, password_hash, name, role, avatar_url, bio) VALUES (?, ?, ?, ?, ?, ?)'
  );

  const i1 = insertUser.run('amara.osei@radiantthreshold.com', hash('password123'), 'Amara Osei, J.D.', 'instructor', null,
    'Civil rights attorney and legal educator. Has defended over 400 protesters, won landmark cases protecting First Amendment rights at demonstrations, and built Know Your Rights programs used by bail funds and organizer networks in 22 states.');
  const i2 = insertUser.run('keisha.morgan@radiantthreshold.com', hash('password123'), 'Dr. Keisha Morgan', 'instructor', null,
    'Environmental justice scholar and frontline activist. Spent 15 years fighting petrochemical plants in Cancer Alley, coordinating Indigenous water rights campaigns, and building community science programs that hold polluters accountable. PhD in Environmental Studies, Tulane University.');
  const i3 = insertUser.run('bekura.mainoo@radiantthreshold.com', hash('password123'), 'BeKura Mainoo', 'instructor', 'bekura-mainoo.jpg',
    'Founder of the Injustice Reform Network (VA/757 Operations) and founder of First State Advocates. Over 15 years of civil rights, criminal justice reform, and foster system advocacy.');
  const i4 = insertUser.run('aziza.okoro@radiantthreshold.com', hash('password123'), 'Aziza Okoro', 'instructor', 'aziza-okoro.jpg',
    'Vice President of the Injustice Reform Network (IRN). Renowned Baltimore-based abolitionist organizer with over two decades of experience in housing rights, harm reduction, peer support networks, and community-led workforce development.');

  const iIds = [i1.lastInsertRowid, i2.lastInsertRowid, i3.lastInsertRowid, i4.lastInsertRowid];

  const insertCourse = db.prepare(`
    INSERT INTO courses (title, subtitle, description, instructor_id, price, category,
      thumbnail_gradient, video_hours, level, student_count, rating)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const c1 = insertCourse.run(
    "The Organizer's Playbook: Building Power from the Ground Up",
    'Master grassroots organizing used by movements that actually win',
    "Master the fundamentals of grassroots organizing — base building, coalition work, power mapping, and winning campaigns. Aziza Okoro's framework has been used by organizers in 30+ cities to win living wage laws, police accountability measures, and environmental protections.",
    iIds[3], 97, 'Community Organizing', 'linear-gradient(135deg, #1a1a2e, #6b21a8)', 18, 'All Levels', 8420, 4.9
  );
  const c2 = insertCourse.run(
    'Know Your Rights: A Practical Legal Defense Guide',
    'Protect yourself and your community — before, during, and after direct action',
    'Understanding your constitutional rights during protests, encounters with law enforcement, and legal proceedings. Includes state-by-state reference guides, templates for legal observer networks, and emergency legal contact protocols.',
    iIds[0], 0, 'Legal Rights & Advocacy', 'linear-gradient(135deg, #7f1d1d, #991b1b)', 12, 'All Levels', 31200, 4.9
  );
  const c3 = insertCourse.run(
    'Digital Organizing Masterclass: Campaigns That Win',
    'Build viral campaigns and mobilize supporters at scale',
    'Build viral campaigns, grow your movement online, master social media strategy for activism, and use data tools to mobilize supporters. Covers rapid response, narrative warfare, and building digital infrastructure for sustained organizing.',
    iIds[1], 79, 'Digital Activism', 'linear-gradient(135deg, #0f172a, #1e40af)', 14, 'Intermediate', 14600, 4.8
  );
  insertCourse.run(
    'Environmental Justice: Frontline Community Leadership',
    'From pipeline fights to climate policy — organizing tools for frontline communities',
    'From pipeline fights to climate policy — how frontline communities organize, win, and hold polluters accountable. Real case studies from Standing Rock, Cancer Alley, South LA, and beyond. Includes community science toolkit and legal strategies for environmental enforcement.',
    iIds[1], 67, 'Environmental Justice', 'linear-gradient(135deg, #064e3b, #065f46)', 16, 'All Levels', 6100, 4.9
  );
  insertCourse.run(
    'Policy to Power: Turning Advocacy into Law',
    'Navigate legislatures and turn community demands into real policy wins',
    'Navigate legislatures, draft model legislation, build lobbying coalitions, and turn community demands into actual policy wins. Covers local, state, and federal advocacy strategy, budget campaigns, and how to survive and leverage electoral cycles.',
    iIds[0], 129, 'Policy & Legislation', 'linear-gradient(135deg, #451a03, #92400e)', 20, 'Advanced', 5300, 4.8
  );
  insertCourse.run(
    'Prison Abolition & Reform: A Practical Advocate Guide',
    'Toolkit for decarceration, reentry support, and systemic reform',
    'The history, theory, and practice of decarceration. A toolkit for advocates working to reduce incarceration, support returning citizens, challenge solitary confinement, and push for systemic reform. Includes model legislation, campaign case studies, and coalition building guidance.',
    iIds[3], 49, 'Criminal Justice Reform', 'linear-gradient(135deg, #1c1917, #44403c)', 15, 'All Levels', 9800, 4.9
  );

  // Sections & lessons for first course
  const insertSection = db.prepare('INSERT INTO sections (course_id, title, order_index) VALUES (?, ?, ?)');
  const insertLesson = db.prepare('INSERT INTO lessons (section_id, title, duration, type, is_free, order_index) VALUES (?, ?, ?, ?, ?, ?)');

  const courseId = c1.lastInsertRowid;
  const sections = [
    { title: 'Foundations of Distributed Systems', lessons: [
      ['What is System Design?', '12:30', 'video', 1, 0],
      ['CAP Theorem Explained', '18:45', 'video', 1, 1],
      ['Horizontal vs Vertical Scaling', '15:20', 'video', 0, 2],
    ]},
    { title: 'Database Design & Optimization', lessons: [
      ['SQL vs NoSQL: When to Use Which', '22:10', 'video', 0, 0],
      ['Sharding Strategies', '19:35', 'video', 0, 1],
      ['Caching with Redis', '24:00', 'video', 0, 2],
    ]},
    { title: 'Building Resilient APIs', lessons: [
      ['REST vs GraphQL vs gRPC', '20:15', 'video', 0, 0],
      ['Rate Limiting & Throttling', '16:40', 'video', 0, 1],
      ['API Gateway Patterns', '18:55', 'quiz', 0, 2],
    ]},
  ];

  sections.forEach((sec, si) => {
    const { lastInsertRowid: secId } = insertSection.run(courseId, sec.title, si);
    sec.lessons.forEach(l => insertLesson.run(secId, ...l));
  });

  // Sample student
  insertUser.run('student@example.com', hash('password123'), 'Alex Johnson', 'student', 'Aspiring developer');

  // Seed FOIA requests
  const insertFOIA = db.prepare('INSERT INTO foia_requests (state, request_date, status, notes) VALUES (?, ?, ?, ?)');
  insertFOIA.run('ME', '2026-03-05', 'Fulfilled', 'Requested DOJ subpoena communications with Maine DOC.');
  insertFOIA.run('VA', '2026-04-12', 'Pending', 'Requested public safety subpoena communications with Virginia DOC.');
  insertFOIA.run('MD', '2026-05-01', 'Pending', 'Subpoena audit for Maryland DOC.');
  insertFOIA.run('NC', '2026-05-15', 'Denied', 'North Carolina DOC refused records citing administrative exemption.');

  // Seed Docket alerts
  const insertDocket = db.prepare('INSERT INTO docket_alerts (docket_id, case_name, docket_number, court, state_jurisdiction, date_filed, url) VALUES (?, ?, ?, ?, ?, ?, ?)');
  insertDocket.run(
    'ME-2026-104', 
    'U.S. Department of Justice v. Maine Department of Corrections', 
    '2:26-cv-00104', 
    'U.S. District Court for the District of Maine', 
    'ME', 
    '2026-03-12', 
    'https://www.courtlistener.com/docket/68291024/us-v-maine-doc/'
  );
  insertDocket.run(
    'MD-2026-452', 
    'In Re: Subpoena to Maryland Department of Public Safety', 
    '1:26-cv-01452', 
    'U.S. District Court for the District of Maryland', 
    'MD', 
    '2026-04-18', 
    'https://www.courtlistener.com/docket/68341029/in-re-subpoena-md-doc/'
  );

  console.log('✅ Database seeded successfully');
}

seed();

module.exports = db;
