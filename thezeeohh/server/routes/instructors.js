const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticate, requireRole } = require('../middleware/auth');

// GET /api/instructors
router.get('/', (req, res) => {
  const instructors = db.prepare(`
    SELECT u.id, u.name, u.bio, u.avatar_url, u.created_at,
      COUNT(DISTINCT c.id) as course_count,
      COALESCE(SUM(c.student_count), 0) as total_students,
      ROUND(AVG(c.rating), 1) as avg_rating
    FROM users u
    LEFT JOIN courses c ON c.instructor_id = u.id AND c.status = 'published'
    WHERE u.role = 'instructor'
    GROUP BY u.id
    ORDER BY total_students DESC
  `).all();
  res.json(instructors);
});

// GET /api/instructors/:id
router.get('/:id', (req, res) => {
  const instructor = db.prepare(`
    SELECT u.id, u.name, u.bio, u.avatar_url, u.created_at,
      COUNT(DISTINCT c.id) as course_count,
      COALESCE(SUM(c.student_count), 0) as total_students,
      ROUND(AVG(c.rating), 1) as avg_rating
    FROM users u
    LEFT JOIN courses c ON c.instructor_id = u.id AND c.status = 'published'
    WHERE u.id = ? AND u.role IN ('instructor','admin')
    GROUP BY u.id
  `).get(req.params.id);

  if (!instructor) return res.status(404).json({ error: 'Instructor not found' });

  const courses = db.prepare(
    'SELECT * FROM courses WHERE instructor_id = ? AND status = ? ORDER BY student_count DESC'
  ).all(req.params.id, 'published');

  const reviews = db.prepare(`
    SELECT r.*, u.name as reviewer_name, c.title as course_title
    FROM reviews r
    JOIN users u ON r.user_id = u.id
    JOIN courses c ON r.course_id = c.id
    WHERE c.instructor_id = ?
    ORDER BY r.created_at DESC LIMIT 10
  `).all(req.params.id);

  res.json({ ...instructor, courses, reviews });
});

// POST /api/instructors/apply
router.post('/apply', (req, res) => {
  const { name, email, specialty, bio, linkedin_url, sample_course_idea } = req.body;
  if (!name || !email || !specialty)
    return res.status(400).json({ error: 'name, email, and specialty are required' });

  const existing = db.prepare('SELECT id FROM instructor_applications WHERE email = ?').get(email);
  if (existing) return res.status(409).json({ error: 'An application with this email already exists' });

  const info = db.prepare(`
    INSERT INTO instructor_applications (name, email, specialty, bio, linkedin_url, sample_course_idea)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(name, email, specialty, bio, linkedin_url, sample_course_idea);

  res.status(201).json({
    success: true,
    message: 'Application submitted! We review applications within 3–5 business days.',
    id: info.lastInsertRowid
  });
});

// GET /api/instructors/:id/earnings  (own only)
router.get('/:id/earnings', authenticate, requireRole('instructor'), (req, res) => {
  if (parseInt(req.params.id) !== req.user.id && req.user.role !== 'admin')
    return res.status(403).json({ error: 'Access denied' });

  const earnings = db.prepare(`
    SELECT
      c.title,
      COUNT(e.id) as enrollment_count,
      COALESCE(SUM(e.instructor_payout), 0) as total_earnings,
      COALESCE(SUM(e.platform_fee), 0) as platform_fees
    FROM courses c
    LEFT JOIN enrollments e ON e.course_id = c.id
    WHERE c.instructor_id = ?
    GROUP BY c.id
    ORDER BY total_earnings DESC
  `).all(req.params.id);

  const totals = db.prepare(`
    SELECT
      COALESCE(SUM(e.instructor_payout), 0) as lifetime_earnings,
      COALESCE(SUM(e.amount_paid), 0) as gross_revenue,
      COUNT(e.id) as total_enrollments
    FROM enrollments e
    JOIN courses c ON e.course_id = c.id
    WHERE c.instructor_id = ?
  `).get(req.params.id);

  res.json({ courses: earnings, totals });
});

module.exports = router;
