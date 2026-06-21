const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticate } = require('../middleware/auth');

let stripe;
try {
  stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
} catch (e) {
  console.warn('Stripe not initialized — set STRIPE_SECRET_KEY in .env');
}

const PLATFORM_FEE_PERCENT = 0.15;

// POST /api/payments/create-checkout-session
router.post('/create-checkout-session', authenticate, async (req, res) => {
  if (!stripe) return res.status(503).json({ error: 'Payment service not configured. Add STRIPE_SECRET_KEY to .env' });

  const { courseId } = req.body;
  if (!courseId) return res.status(400).json({ error: 'courseId is required' });

  const course = db.prepare('SELECT * FROM courses WHERE id = ? AND status = ?').get(courseId, 'published');
  if (!course) return res.status(404).json({ error: 'Course not found' });

  const existing = db.prepare('SELECT id FROM enrollments WHERE user_id = ? AND course_id = ?').get(req.user.id, courseId);
  if (existing) return res.status(409).json({ error: 'Already enrolled in this course' });

  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      customer_email: req.user.email,
      metadata: {
        user_id: String(req.user.id),
        course_id: String(courseId)
      },
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: {
            name: course.title,
            description: course.subtitle || undefined,
          },
          unit_amount: Math.round(course.price * 100),
        },
        quantity: 1,
      }],
      success_url: `${process.env.FRONTEND_URL}/success.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.FRONTEND_URL}/course.html?id=${courseId}`,
    });

    res.json({ url: session.url, sessionId: session.id });
  } catch (err) {
    console.error('Stripe error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/payments/webhook
router.post('/webhook', express.raw({ type: 'application/json' }), (req, res) => {
  if (!stripe) return res.status(503).send('Stripe not configured');

  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature error:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const userId = parseInt(session.metadata.user_id);
    const courseId = parseInt(session.metadata.course_id);
    const amountPaid = session.amount_total / 100;
    const platformFee = parseFloat((amountPaid * PLATFORM_FEE_PERCENT).toFixed(2));
    const instructorPayout = parseFloat((amountPaid - platformFee).toFixed(2));

    try {
      db.prepare(`
        INSERT OR IGNORE INTO enrollments
          (user_id, course_id, stripe_session_id, amount_paid, platform_fee, instructor_payout)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(userId, courseId, session.id, amountPaid, platformFee, instructorPayout);

      db.prepare('UPDATE courses SET student_count = student_count + 1 WHERE id = ?').run(courseId);
      console.log(`✅ Enrollment created: user ${userId} → course ${courseId} ($${amountPaid})`);
    } catch (err) {
      console.error('DB enrollment error:', err.message);
    }
  }

  res.json({ received: true });
});

// GET /api/payments/success?session_id=
router.get('/success', authenticate, async (req, res) => {
  if (!stripe) return res.status(503).json({ error: 'Payment service not configured' });

  const { session_id } = req.query;
  if (!session_id) return res.status(400).json({ error: 'session_id is required' });

  try {
    const session = await stripe.checkout.sessions.retrieve(session_id);
    if (session.payment_status !== 'paid') {
      return res.status(402).json({ error: 'Payment not completed' });
    }

    const courseId = session.metadata.course_id;
    const course = db.prepare('SELECT id, title, subtitle, category FROM courses WHERE id = ?').get(courseId);
    const enrollment = db.prepare('SELECT * FROM enrollments WHERE stripe_session_id = ?').get(session_id);

    res.json({ success: true, course, enrollment });
  } catch (err) {
    console.error('Success check error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
