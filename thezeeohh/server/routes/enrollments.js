const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticate } = require('../middleware/auth');

// GET /api/enrollments/my
router.get('/my', authenticate, (req, res) => {
  const enrollments = db.prepare(`
    SELECT e.*, c.title, c.subtitle, c.category, c.thumbnail_gradient,
           c.video_hours, c.level, c.rating, u.name as instructor_name
    FROM enrollments e
    JOIN courses c ON e.course_id = c.id
    JOIN users u ON c.instructor_id = u.id
    WHERE e.user_id = ?
    ORDER BY e.enrolled_at DESC
  `).all(req.user.id);

  res.json(enrollments);
});

// PATCH /api/enrollments/:courseId/progress
router.patch('/:courseId/progress', authenticate, (req, res) => {
  const { progress } = req.body;
  if (progress === undefined || progress < 0 || progress > 100)
    return res.status(400).json({ error: 'progress must be between 0 and 100' });

  const enrollment = db.prepare(
    'SELECT id FROM enrollments WHERE user_id = ? AND course_id = ?'
  ).get(req.user.id, req.params.courseId);

  if (!enrollment) return res.status(404).json({ error: 'Enrollment not found' });

  db.prepare('UPDATE enrollments SET progress = ? WHERE id = ?').run(Math.round(progress), enrollment.id);
  res.json({ success: true, progress: Math.round(progress) });
});

module.exports = router;
