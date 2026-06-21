const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticate } = require('../middleware/auth');

// POST /api/reviews
router.post('/', authenticate, (req, res) => {
  const { courseId, rating, comment } = req.body;
  if (!courseId || !rating) return res.status(400).json({ error: 'courseId and rating are required' });
  if (rating < 1 || rating > 5) return res.status(400).json({ error: 'rating must be between 1 and 5' });

  const enrollment = db.prepare(
    'SELECT id FROM enrollments WHERE user_id = ? AND course_id = ?'
  ).get(req.user.id, courseId);
  if (!enrollment) return res.status(403).json({ error: 'You must be enrolled to leave a review' });

  try {
    const info = db.prepare(
      'INSERT INTO reviews (user_id, course_id, rating, comment) VALUES (?, ?, ?, ?)'
    ).run(req.user.id, courseId, rating, comment);

    // Update course rating average
    const avg = db.prepare('SELECT ROUND(AVG(rating), 1) as avg FROM reviews WHERE course_id = ?').get(courseId);
    db.prepare('UPDATE courses SET rating = ? WHERE id = ?').run(avg.avg, courseId);

    const review = db.prepare(`
      SELECT r.*, u.name as reviewer_name FROM reviews r
      JOIN users u ON r.user_id = u.id WHERE r.id = ?
    `).get(info.lastInsertRowid);

    res.status(201).json(review);
  } catch (err) {
    if (err.message.includes('UNIQUE'))
      return res.status(409).json({ error: 'You have already reviewed this course' });
    res.status(500).json({ error: 'Failed to submit review' });
  }
});

// GET /api/reviews/course/:id
router.get('/course/:id', (req, res) => {
  const reviews = db.prepare(`
    SELECT r.*, u.name as reviewer_name
    FROM reviews r JOIN users u ON r.user_id = u.id
    WHERE r.course_id = ?
    ORDER BY r.created_at DESC
  `).all(req.params.id);

  const stats = db.prepare(`
    SELECT
      COUNT(*) as total,
      ROUND(AVG(rating), 1) as average,
      SUM(CASE WHEN rating = 5 THEN 1 ELSE 0 END) as five_star,
      SUM(CASE WHEN rating = 4 THEN 1 ELSE 0 END) as four_star,
      SUM(CASE WHEN rating = 3 THEN 1 ELSE 0 END) as three_star,
      SUM(CASE WHEN rating = 2 THEN 1 ELSE 0 END) as two_star,
      SUM(CASE WHEN rating = 1 THEN 1 ELSE 0 END) as one_star
    FROM reviews WHERE course_id = ?
  `).get(req.params.id);

  res.json({ reviews, stats });
});

module.exports = router;
