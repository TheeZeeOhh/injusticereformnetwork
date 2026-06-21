const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticate, requireRole } = require('../middleware/auth');

// GET /api/courses
router.get('/', (req, res) => {
  const { category, search, price_max, rating, sort = 'popular' } = req.query;

  let query = `
    SELECT c.*, u.name as instructor_name, u.bio as instructor_bio
    FROM courses c
    JOIN users u ON c.instructor_id = u.id
    WHERE c.status = 'published'
  `;
  const params = [];

  if (category) { query += ` AND c.category = ?`; params.push(category); }
  if (search) { query += ` AND (c.title LIKE ? OR c.subtitle LIKE ?)`; params.push(`%${search}%`, `%${search}%`); }
  if (price_max) { query += ` AND c.price <= ?`; params.push(Number(price_max)); }
  if (rating) { query += ` AND c.rating >= ?`; params.push(Number(rating)); }

  const sortMap = {
    popular: 'c.student_count DESC',
    newest: 'c.created_at DESC',
    price_asc: 'c.price ASC',
    price_desc: 'c.price DESC',
    rating: 'c.rating DESC'
  };
  query += ` ORDER BY ${sortMap[sort] || sortMap.popular}`;

  const courses = db.prepare(query).all(...params);
  res.json(courses);
});

// GET /api/courses/:id
router.get('/:id', (req, res) => {
  const course = db.prepare(`
    SELECT c.*, u.name as instructor_name, u.bio as instructor_bio, u.avatar_url as instructor_avatar
    FROM courses c JOIN users u ON c.instructor_id = u.id
    WHERE c.id = ?
  `).get(req.params.id);

  if (!course) return res.status(404).json({ error: 'Course not found' });

  const sections = db.prepare('SELECT * FROM sections WHERE course_id = ? ORDER BY order_index').all(course.id);
  const lessons = db.prepare('SELECT * FROM lessons WHERE section_id IN (SELECT id FROM sections WHERE course_id = ?) ORDER BY order_index').all(course.id);

  const sectionMap = sections.map(s => ({
    ...s,
    lessons: lessons.filter(l => l.section_id === s.id)
  }));

  const reviews = db.prepare(`
    SELECT r.*, u.name as reviewer_name FROM reviews r
    JOIN users u ON r.user_id = u.id
    WHERE r.course_id = ? ORDER BY r.created_at DESC LIMIT 10
  `).all(course.id);

  res.json({ ...course, sections: sectionMap, reviews });
});

// GET /api/courses/:id/enrolled
router.get('/:id/enrolled', authenticate, (req, res) => {
  const enrollment = db.prepare(
    'SELECT * FROM enrollments WHERE user_id = ? AND course_id = ?'
  ).get(req.user.id, req.params.id);
  res.json({ enrolled: !!enrollment, enrollment });
});

// POST /api/courses
router.post('/', authenticate, requireRole('instructor'), (req, res) => {
  const { title, subtitle, description, price, category, level, thumbnail_gradient } = req.body;
  if (!title || !price || !category)
    return res.status(400).json({ error: 'title, price and category are required' });

  const info = db.prepare(`
    INSERT INTO courses (title, subtitle, description, instructor_id, price, category, level, thumbnail_gradient)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(title, subtitle, description, req.user.id, price, category, level || 'All Levels', thumbnail_gradient || 'linear-gradient(135deg,#6366f1,#8b5cf6)');

  const course = db.prepare('SELECT * FROM courses WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json(course);
});

// PUT /api/courses/:id
router.put('/:id', authenticate, requireRole('instructor'), (req, res) => {
  const course = db.prepare('SELECT * FROM courses WHERE id = ?').get(req.params.id);
  if (!course) return res.status(404).json({ error: 'Course not found' });
  if (course.instructor_id !== req.user.id && req.user.role !== 'admin')
    return res.status(403).json({ error: 'Not authorized to edit this course' });

  const { title, subtitle, description, price, category, level, status } = req.body;
  db.prepare(`
    UPDATE courses SET title=COALESCE(?,title), subtitle=COALESCE(?,subtitle),
    description=COALESCE(?,description), price=COALESCE(?,price),
    category=COALESCE(?,category), level=COALESCE(?,level),
    status=COALESCE(?,status), updated_at=CURRENT_TIMESTAMP WHERE id=?
  `).run(title, subtitle, description, price, category, level, status, course.id);

  res.json(db.prepare('SELECT * FROM courses WHERE id = ?').get(course.id));
});

module.exports = router;
