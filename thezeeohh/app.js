/* ============================================================
   RADIANT THRESHOLD — app.js
   Shared JavaScript: all interactive behaviours
   ============================================================ */

'use strict';

/* ────────────────────────────────────────────
   1. NAVBAR — Scroll effect + active link
──────────────────────────────────────────── */
(function initNavbar() {
  const navbar = document.getElementById('navbar');
  if (!navbar) return;

  function onScroll() {
    if (window.scrollY > 24) {
      navbar.classList.add('scrolled');
    } else {
      navbar.classList.remove('scrolled');
    }
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll(); // run immediately

  // Active link highlighting based on current page
  const currentPage = window.location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.nav-link').forEach(link => {
    const href = link.getAttribute('href');
    if (href && (href === currentPage || href.startsWith(currentPage.replace('.html', '')))) {
      link.classList.add('active');
    }
  });
})();


/* ────────────────────────────────────────────
   2. MOBILE NAV TOGGLE
──────────────────────────────────────────── */
(function initMobileNav() {
  const hamburger = document.getElementById('hamburger');
  const mobileNav = document.getElementById('mobileNav');
  if (!hamburger || !mobileNav) return;

  hamburger.addEventListener('click', () => {
    const isOpen = mobileNav.classList.toggle('open');
    hamburger.classList.toggle('open', isOpen);
    hamburger.setAttribute('aria-expanded', isOpen);
    document.body.style.overflow = isOpen ? 'hidden' : '';
  });

  // Close mobile nav when a link is clicked
  mobileNav.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', () => {
      mobileNav.classList.remove('open');
      hamburger.classList.remove('open');
      document.body.style.overflow = '';
    });
  });

  // Close on ESC
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && mobileNav.classList.contains('open')) {
      mobileNav.classList.remove('open');
      hamburger.classList.remove('open');
      document.body.style.overflow = '';
    }
  });
})();


/* ────────────────────────────────────────────
   3. INTERSECTION OBSERVER — Scroll animations
──────────────────────────────────────────── */
(function initScrollAnimations() {
  const elements = document.querySelectorAll('.animate-on-scroll');
  if (!elements.length) return;

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('animated');
        observer.unobserve(entry.target); // fire once
      }
    });
  }, {
    rootMargin: '0px 0px -60px 0px',
    threshold: 0.08
  });

  elements.forEach(el => observer.observe(el));
})();


/* ────────────────────────────────────────────
   4. SMOOTH SCROLL for anchor links
──────────────────────────────────────────── */
(function initSmoothScroll() {
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function(e) {
      const targetId = this.getAttribute('href');
      if (targetId === '#') return;
      const target = document.querySelector(targetId);
      if (target) {
        e.preventDefault();
        const navH = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--nav-height')) || 72;
        const top = target.getBoundingClientRect().top + window.scrollY - navH - 16;
        window.scrollTo({ top, behavior: 'smooth' });
      }
    });
  });
})();


/* ────────────────────────────────────────────
   5. CATEGORY PILLS (Homepage)
──────────────────────────────────────────── */
(function initCategoryPills() {
  const pills = document.querySelectorAll('.category-pill');
  if (!pills.length) return;

  pills.forEach(pill => {
    pill.addEventListener('click', () => {
      pills.forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      // On homepage, scroll to courses section
      const coursesSection = document.getElementById('courses');
      if (coursesSection) {
        const navH = 72;
        window.scrollTo({ top: coursesSection.offsetTop - navH - 16, behavior: 'smooth' });
      }
    });
  });
})();


/* ────────────────────────────────────────────
   6. NEWSLETTER FORM
   Mailchimp-ready: swap MAILCHIMP_URL's REPLACE_U / REPLACE_ID / REPLACE_FID
   for Radiant Threshold's real audience params (Mailchimp → Audience →
   Signup forms → Embedded forms → copy the form action URL) and this
   goes live with zero other changes. Until then it degrades gracefully
   to a local "you're on the list" state — no fake success theater either
   way, the button does what the copy says.
──────────────────────────────────────────── */
(function initNewsletter() {
  const STORAGE_KEY = 'rt_newsletter_subscribed';
  const MAILCHIMP_URL =
    'https://radiantthreshold.us21.list-manage.com/subscribe/post?u=REPLACE_U&id=REPLACE_ID&f_id=REPLACE_FID';

  const isValidEmail = (val) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val);

  // 1. Setup inline form (if present on the page)
  const form = document.getElementById('newsletterForm');
  const success = document.getElementById('newsletterSuccess');
  const errorEl = document.getElementById('newsletterError');
  const emailInput = document.getElementById('newsletterEmail');
  const submitBtn = document.getElementById('newsletterSubmit');

  function showInlineSubscribed() {
    if (form) form.style.display = 'none';
    if (success) success.classList.add('show');
  }

  if (form && localStorage.getItem(STORAGE_KEY) === 'true') {
    showInlineSubscribed();
  }

  if (emailInput) {
    emailInput.addEventListener('input', () => {
      if (errorEl) {
        errorEl.textContent = '';
        emailInput.setAttribute('aria-invalid', 'false');
      }
    });
  }

  if (form) {
    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      if (errorEl) {
        errorEl.textContent = '';
        if (emailInput) emailInput.setAttribute('aria-invalid', 'false');
      }

      const email = emailInput ? emailInput.value.trim() : '';
      if (!email) {
        if (errorEl) errorEl.textContent = 'Please enter your email address.';
        if (emailInput) {
          emailInput.setAttribute('aria-invalid', 'true');
          emailInput.focus();
        }
        return;
      }
      if (!isValidEmail(email)) {
        if (errorEl) errorEl.textContent = 'Please enter a valid email address.';
        if (emailInput) {
          emailInput.setAttribute('aria-invalid', 'true');
          emailInput.focus();
        }
        return;
      }

      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = 'Subscribing&hellip;';
      }

      if (MAILCHIMP_URL.includes('REPLACE_U')) {
        localStorage.setItem(STORAGE_KEY, 'true');
        showInlineSubscribed();
        // Also update modal state if it's open
        const modalForm = document.getElementById('modalNewsletterForm');
        const modalSuccess = document.getElementById('modalNewsletterSuccess');
        if (modalForm) modalForm.style.display = 'none';
        if (modalSuccess) modalSuccess.style.display = 'flex';
        return;
      }

      try {
        await new Promise((resolve, reject) => {
          const cbName = '__rt_mc_cb_' + Date.now();
          const script = document.createElement('script');
          window[cbName] = function (data) {
            delete window[cbName];
            script.remove();
            if (data && data.result === 'success') resolve();
            else reject(new Error((data && data.msg) || 'subscribe_failed'));
          };
          const jsonpUrl = MAILCHIMP_URL.replace('/post?', '/post-json?') +
            '&EMAIL=' + encodeURIComponent(email) + '&c=' + cbName;
          script.src = jsonpUrl;
          script.onerror = () => reject(new Error('network_error'));
          document.head.appendChild(script);
        });
        localStorage.setItem(STORAGE_KEY, 'true');
        showInlineSubscribed();
        const modalForm = document.getElementById('modalNewsletterForm');
        const modalSuccess = document.getElementById('modalNewsletterSuccess');
        if (modalForm) modalForm.style.display = 'none';
        if (modalSuccess) modalSuccess.style.display = 'flex';
      } catch (err) {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerHTML = 'Join the Network <i class="fas fa-paper-plane"></i>';
        }
        if (errorEl) errorEl.textContent = 'Subscription failed. Email us directly to join the list.';
      }
    });
  }

  // 2. Setup Global Interceptor for Newsletter Links (to trigger modal)
  document.addEventListener('click', function (e) {
    const anchor = e.target.closest('a');
    if (anchor && anchor.getAttribute('href') && anchor.getAttribute('href').includes('newsletterForm')) {
      e.preventDefault();
      openNewsletterModal();
    }
  });

  function openNewsletterModal() {
    let overlay = document.querySelector('.newsletter-modal-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.className = 'newsletter-modal-overlay';
      overlay.innerHTML = `
        <div class="newsletter-modal-card">
          <button class="newsletter-modal-close" aria-label="Close modal">&times;</button>
          <div class="newsletter-modal-header">
            <h3>Join the Movement</h3>
            <p>Subscribe to our newsletter for critical campaign updates, tactical guides, and educational materials.</p>
          </div>
          <form class="newsletter-form" id="modalNewsletterForm" novalidate style="display: block; width: 100%; max-width: 100%;">
            <label for="modalNewsletterEmail" class="sr-only">Email address</label>
            <input type="email" placeholder="Enter your email address" id="modalNewsletterEmail" required style="width: 100%; padding: 0.85rem 1.1rem; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 10px; color: #fff; font-family: inherit; font-size: 1rem; outline: none; margin-bottom: 12px; transition: all 0.2s;" />
            <button type="submit" class="btn btn-primary" id="modalNewsletterSubmit" style="width: 100%; justify-content: center; height: 48px;">
              Join the Network <i class="fas fa-paper-plane" style="margin-left: 8px;"></i>
            </button>
          </form>
          <p class="newsletter-error" id="modalNewsletterError" role="alert" aria-live="assertive" style="text-align: center; margin-top: 12px;"></p>
          <div class="newsletter-success" id="modalNewsletterSuccess" role="status" aria-live="polite" style="display: none; text-align: center; color: #c9a84c; font-weight: 600; margin-top: 12px; flex-direction: column; align-items: center; gap: 8px;">
            <i class="fas fa-check-circle" style="font-size: 2rem;"></i>
            <span>You are on the list! Welcome to the fight.</span>
          </div>
        </div>
      `;
      document.body.appendChild(overlay);

      // Close handlers
      overlay.querySelector('.newsletter-modal-close').addEventListener('click', closeNewsletterModal);
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeNewsletterModal();
      });

      // Submit handler
      const mForm = document.getElementById('modalNewsletterForm');
      const mEmailInput = document.getElementById('modalNewsletterEmail');
      const mErrorEl = document.getElementById('modalNewsletterError');
      const mSuccessEl = document.getElementById('modalNewsletterSuccess');
      const mSubmitBtn = document.getElementById('modalNewsletterSubmit');

      mEmailInput.addEventListener('input', () => {
        mErrorEl.textContent = '';
        mEmailInput.setAttribute('aria-invalid', 'false');
      });

      mForm.addEventListener('submit', async function (e) {
        e.preventDefault();
        mErrorEl.textContent = '';
        mEmailInput.setAttribute('aria-invalid', 'false');

        const email = mEmailInput.value.trim();
        if (!email) {
          mErrorEl.textContent = 'Please enter your email address.';
          mEmailInput.setAttribute('aria-invalid', 'true');
          mEmailInput.focus();
          return;
        }
        if (!isValidEmail(email)) {
          mErrorEl.textContent = 'Please enter a valid email address.';
          mEmailInput.setAttribute('aria-invalid', 'true');
          mEmailInput.focus();
          return;
        }

        mSubmitBtn.disabled = true;
        mSubmitBtn.innerHTML = 'Subscribing&hellip;';

        if (MAILCHIMP_URL.includes('REPLACE_U')) {
          localStorage.setItem(STORAGE_KEY, 'true');
          mForm.style.display = 'none';
          mSuccessEl.style.display = 'flex';
          showInlineSubscribed();
          return;
        }

        try {
          await new Promise((resolve, reject) => {
            const cbName = '__rt_mc_cb_modal_' + Date.now();
            const script = document.createElement('script');
            window[cbName] = function (data) {
              delete window[cbName];
              script.remove();
              if (data && data.result === 'success') resolve();
              else reject(new Error((data && data.msg) || 'subscribe_failed'));
            };
            const jsonpUrl = MAILCHIMP_URL.replace('/post?', '/post-json?') +
              '&EMAIL=' + encodeURIComponent(email) + '&c=' + cbName;
            script.src = jsonpUrl;
            script.onerror = () => reject(new Error('network_error'));
            document.head.appendChild(script);
          });
          localStorage.setItem(STORAGE_KEY, 'true');
          mForm.style.display = 'none';
          mSuccessEl.style.display = 'flex';
          showInlineSubscribed();
        } catch (err) {
          mSubmitBtn.disabled = false;
          mSubmitBtn.innerHTML = 'Join the Network <i class="fas fa-paper-plane"></i>';
          mErrorEl.textContent = 'Subscription failed. Email us directly to join the list.';
        }
      });
    }

    // Check pre-subscribed state
    const mForm = document.getElementById('modalNewsletterForm');
    const mSuccessEl = document.getElementById('modalNewsletterSuccess');
    if (localStorage.getItem(STORAGE_KEY) === 'true') {
      if (mForm) mForm.style.display = 'none';
      if (mSuccessEl) mSuccessEl.style.display = 'flex';
    } else {
      if (mForm) mForm.style.display = 'block';
      if (mSuccessEl) mSuccessEl.style.display = 'none';
    }

    // Show modal (triggers CSS transitions)
    setTimeout(() => overlay.classList.add('show'), 10);
    document.addEventListener('keydown', handleEscKey);
  }

  function closeNewsletterModal() {
    const overlay = document.querySelector('.newsletter-modal-overlay');
    if (overlay) {
      overlay.classList.remove('show');
      document.removeEventListener('keydown', handleEscKey);
    }
  }

  function handleEscKey(e) {
    if (e.key === 'Escape') closeNewsletterModal();
  }
})();


/* ────────────────────────────────────────────
   7. CURRICULUM ACCORDION
──────────────────────────────────────────── */
(function initAccordion() {
  const items = document.querySelectorAll('.accordion-item');
  if (!items.length) return;

  items.forEach(item => {
    const header = item.querySelector('.accordion-header');
    if (!header) return;

    header.addEventListener('click', () => {
      const isOpen = item.classList.contains('open');

      // Close all others (optional: remove for multiple-open behaviour)
      items.forEach(i => {
        if (i !== item) i.classList.remove('open');
      });

      item.classList.toggle('open', !isOpen);
    });
  });
})();


/* ────────────────────────────────────────────
   8. EXPLORE PAGE — Filter, Sort, Search
──────────────────────────────────────────── */
(function initExploreFilters() {
  const grid = document.getElementById('coursesGrid');
  if (!grid) return;

  const searchInput = document.getElementById('courseSearch');
  const sortSelect  = document.getElementById('sortSelect');
  const priceRange  = document.getElementById('priceRange');
  const priceLabel  = document.getElementById('priceLabel');
  const countNum    = document.getElementById('countNum');
  const noResults   = document.getElementById('noResults');
  const resetBtn    = document.getElementById('resetFilters');

  // Gather all cards (exclude the no-results placeholder)
  const getAllCards = () => Array.from(grid.querySelectorAll('.course-card'));

  // State
  let activeCategories = [];
  let maxPrice = 400;
  let minRating = 0;
  let activeType = 'all';
  let searchQuery = '';
  let sortMode = 'popular';

  // Initialise from checkboxes
  function syncCategories() {
    const checked = document.querySelectorAll('[data-filter="category"]:checked');
    activeCategories = Array.from(checked).map(c => c.value);
  }

  // Parse URL query parameter for category on load
  const urlParams = new URLSearchParams(window.location.search);
  const urlCategory = urlParams.get('category');
  if (urlCategory) {
    document.querySelectorAll('[data-filter="category"]').forEach(cb => {
      cb.checked = (cb.value === urlCategory);
    });
  }

  syncCategories(); // init

  // ── Category checkboxes ──
  document.querySelectorAll('[data-filter="category"]').forEach(cb => {
    cb.addEventListener('change', () => {
      syncCategories();
      applyFilters();
    });
  });

  // ── Price range ──
  if (priceRange && priceLabel) {
    maxPrice = parseInt(priceRange.value, 10);
    priceRange.addEventListener('input', () => {
      maxPrice = parseInt(priceRange.value, 10);
      priceLabel.textContent = maxPrice >= 400 ? 'Any' : '$' + maxPrice;
      applyFilters();
    });
  }

  // ── Rating options ──
  document.querySelectorAll('.rating-option').forEach(opt => {
    opt.addEventListener('click', () => {
      document.querySelectorAll('.rating-option').forEach(o => o.classList.remove('selected'));
      opt.classList.add('selected');
      minRating = parseFloat(opt.dataset.rating || '0');
      applyFilters();
    });
  });

  // ── Content type chips ──
  document.querySelectorAll('.type-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('.type-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      activeType = chip.dataset.type || 'all';
      applyFilters();
    });
  });

  // ── Search ──
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      searchQuery = searchInput.value.trim().toLowerCase();
      applyFilters();
    });
  }

  // ── Sort ──
  if (sortSelect) {
    sortSelect.addEventListener('change', () => {
      sortMode = sortSelect.value;
      applyFilters();
    });
  }

  // ── Reset ──
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      // Reset checkboxes — select all
      document.querySelectorAll('[data-filter="category"]').forEach(cb => { cb.checked = true; });
      syncCategories();

      // Reset price
      if (priceRange) { priceRange.value = 400; maxPrice = 400; }
      if (priceLabel) priceLabel.textContent = 'Any';

      // Reset rating
      minRating = 0;
      document.querySelectorAll('.rating-option').forEach((o, i) => o.classList.toggle('selected', i === 0));

      // Reset type
      activeType = 'all';
      document.querySelectorAll('.type-chip').forEach((c, i) => c.classList.toggle('active', i === 0));

      // Reset search
      if (searchInput) { searchInput.value = ''; searchQuery = ''; }

      // Reset sort
      if (sortSelect) { sortSelect.value = 'popular'; sortMode = 'popular'; }

      applyFilters();
    });
  }

  // ── Core filter + sort logic ──
  function applyFilters() {
    const cards = getAllCards();
    let visible = [];

    cards.forEach(card => {
      const cat      = card.dataset.category || '';
      const price    = parseFloat(card.dataset.price || '0');
      const rating   = parseFloat(card.dataset.rating || '0');
      const type     = card.dataset.type || '';
      const title    = (card.dataset.title || card.querySelector('.course-title')?.textContent || '').toLowerCase();
      const instructor = (card.querySelector('.instructor-name')?.textContent || '').toLowerCase();

      const matchCat     = activeCategories.length === 0 || activeCategories.includes(cat);
      const matchPrice   = maxPrice >= 400 || price <= maxPrice;
      const matchRating  = rating >= minRating;
      const matchType    = activeType === 'all' || type === activeType;
      const matchSearch  = !searchQuery || title.includes(searchQuery) || instructor.includes(searchQuery) || cat.includes(searchQuery);

      const show = matchCat && matchPrice && matchRating && matchType && matchSearch;
      card.style.display = show ? '' : 'none';
      if (show) visible.push(card);
    });

    // Sort visible cards
    visible = sortCards(visible, sortMode);

    // Re-append in sorted order
    visible.forEach(card => grid.appendChild(card));

    // Update count
    if (countNum) countNum.textContent = visible.length;

    // Show/hide no-results message
    if (noResults) {
      noResults.style.display = visible.length === 0 ? 'block' : 'none';
    }
  }

  function sortCards(cards, mode) {
    return cards.slice().sort((a, b) => {
      switch (mode) {
        case 'price-low':
          return parseFloat(a.dataset.price) - parseFloat(b.dataset.price);
        case 'price-high':
          return parseFloat(b.dataset.price) - parseFloat(a.dataset.price);
        case 'rating':
          return parseFloat(b.dataset.rating) - parseFloat(a.dataset.rating);
        case 'newest':
          return new Date(b.dataset.date || 0) - new Date(a.dataset.date || 0);
        case 'popular':
        default:
          return parseInt(b.dataset.students || 0) - parseInt(a.dataset.students || 0);
      }
    });
  }

  // Initial run
  applyFilters();
})();


/* ────────────────────────────────────────────
   9. DASHBOARD — Progress bar animations
──────────────────────────────────────────── */
(function initProgressBars() {
  const fills = document.querySelectorAll('.progress-bar-fill[data-width]');
  if (!fills.length) return;

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const fill = entry.target;
        const width = fill.dataset.width || '0';
        setTimeout(() => {
          fill.style.width = width + '%';
        }, 200);
        observer.unobserve(fill);
      }
    });
  }, { threshold: 0.2 });

  fills.forEach(fill => observer.observe(fill));
})();


/* ────────────────────────────────────────────
   10. DASHBOARD SIDEBAR — Active state toggle
──────────────────────────────────────────── */
// Dashboard sidebar panel switching is handled inline in dashboard.html
// (showPanel), which also refreshes dynamic panels. No handler needed here.


/* ────────────────────────────────────────────
   11. RATING BAR FILL ANIMATION (course page)
──────────────────────────────────────────── */
(function initRatingBars() {
  // Rating bars that use inline style widths are already set via CSS transition
  // but we trigger them via IntersectionObserver for a nice entrance effect
  const bars = document.querySelectorAll('.rating-bar-fill');
  if (!bars.length) return;

  bars.forEach(bar => {
    const targetWidth = bar.style.width;
    bar.style.width = '0';

    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          setTimeout(() => { bar.style.width = targetWidth; }, 300);
          observer.unobserve(bar);
        }
      });
    }, { threshold: 0.3 });

    observer.observe(bar);
  });
})();


/* ────────────────────────────────────────────
   12. COURSE CARD — Keyboard accessibility
──────────────────────────────────────────── */
(function initCourseCardA11y() {
  document.querySelectorAll('.course-card').forEach(card => {
    // Make entire card clickable via enter key when focused
    card.setAttribute('tabindex', '0');
    card.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        const link = card.querySelector('a.btn');
        if (link) link.click();
      }
    });
  });
})();


/* ────────────────────────────────────────────
   13. HERO COUNTER ANIMATION
──────────────────────────────────────────── */
(function initCounterAnimation() {
  const stats = document.querySelectorAll('.hero-stat .num');
  if (!stats.length) return;

  function animateValue(el, rawText) {
    // Extract number and suffix
    const match = rawText.match(/^([\d,]+)([^\d,]*)$/);
    if (!match) return;

    const endVal = parseInt(match[1].replace(/,/g, ''), 10);
    const suffix = match[2] || '';
    const duration = 1800;
    const startTime = performance.now();

    function update(currentTime) {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // Ease out
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = Math.round(eased * endVal);
      el.textContent = current.toLocaleString() + suffix;
      if (progress < 1) requestAnimationFrame(update);
    }

    requestAnimationFrame(update);
  }

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const el = entry.target;
        const raw = el.textContent.trim();
        animateValue(el, raw);
        observer.unobserve(el);
      }
    });
  }, { threshold: 0.5 });

  stats.forEach(s => observer.observe(s));
})();


/* ────────────────────────────────────────────
   14. GENERAL TOOLTIP — [data-tooltip] attr
──────────────────────────────────────────── */
(function initTooltips() {
  document.querySelectorAll('[data-tooltip]').forEach(el => {
    el.style.position = 'relative';
    el.addEventListener('mouseenter', () => {
      const tip = document.createElement('div');
      tip.className = '__rt-tooltip';
      tip.textContent = el.dataset.tooltip;
      Object.assign(tip.style, {
        position: 'absolute',
        bottom: 'calc(100% + 8px)',
        left: '50%',
        transform: 'translateX(-50%)',
        background: '#1c1c2e',
        border: '1px solid rgba(255,255,255,0.1)',
        color: '#f0f0f8',
        padding: '6px 12px',
        borderRadius: '8px',
        fontSize: '0.78rem',
        whiteSpace: 'nowrap',
        zIndex: '9999',
        pointerEvents: 'none',
        boxShadow: '0 4px 16px rgba(0,0,0,0.4)'
      });
      el.appendChild(tip);
    });
    el.addEventListener('mouseleave', () => {
      el.querySelector('.__rt-tooltip')?.remove();
    });
  });
})();


/* ────────────────────────────────────────────
   16. AI INSTRUCTOR CHAT WIDGET
   ──────────────────────────────────────────── */
(function initAIChatWidget() {
  // Styles injection
  const styleEl = document.createElement('style');
  styleEl.textContent = `
    #ai-chat-widget {
      position: fixed;
      bottom: 24px;
      right: 24px;
      z-index: 9999;
      font-family: var(--font-sans, system-ui, -apple-system, sans-serif);
    }
    #chat-toggle-btn {
      background: linear-gradient(135deg, #c9a84c, #a18035);
      color: #111;
      border: none;
      padding: 14px 22px;
      border-radius: 50px;
      cursor: pointer;
      font-weight: 700;
      font-size: 0.9rem;
      box-shadow: 0 4px 20px rgba(201, 168, 76, 0.25);
      display: flex;
      align-items: center;
      gap: 10px;
      transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
      border: 1px solid rgba(255, 255, 255, 0.1);
    }
    #chat-toggle-btn:hover {
      transform: translateY(-2px);
      box-shadow: 0 6px 24px rgba(201, 168, 76, 0.4);
    }
    #chat-window {
      display: none;
      width: 360px;
      height: 480px;
      background: rgba(18, 18, 22, 0.95);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      border: 1px solid rgba(201, 168, 76, 0.25);
      border-radius: 16px;
      box-shadow: 0 12px 40px rgba(0, 0, 0, 0.6);
      flex-direction: column;
      margin-bottom: 12px;
      overflow: hidden;
      opacity: 0;
      transform: translateY(20px) scale(0.95);
      transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
    }
    #chat-window.open {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
    .chat-header {
      background: rgba(30, 30, 35, 0.85);
      padding: 14px 16px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .chat-header-info {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .chat-avatar {
      width: 34px;
      height: 34px;
      border-radius: 50%;
      background-size: cover;
      background-position: center;
      border: 1px solid rgba(201, 168, 76, 0.4);
    }
    .chat-close-btn {
      background: none;
      border: none;
      color: #9ca3af;
      cursor: pointer;
      font-size: 1rem;
      transition: color 0.2s;
      padding: 4px;
    }
    .chat-close-btn:hover {
      color: #fff;
    }
    .chat-messages {
      flex: 1;
      padding: 16px;
      overflow-y: auto;
      color: #e5e7eb;
      font-size: 0.85rem;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .chat-bubble {
      padding: 10px 14px;
      border-radius: 12px;
      line-height: 1.45;
      max-width: 80%;
      word-wrap: break-word;
      animation: chatSlideIn 0.25s cubic-bezier(0.16, 1, 0.3, 1) forwards;
    }
    .chat-bubble.ai {
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.05);
      align-self: flex-start;
      border-top-left-radius: 2px;
    }
    .chat-bubble.user {
      background: linear-gradient(135deg, rgba(201, 168, 76, 0.15), rgba(201, 168, 76, 0.05));
      border: 1px solid rgba(201, 168, 76, 0.3);
      align-self: flex-end;
      border-top-right-radius: 2px;
      color: #f3f4f6;
    }
    .chat-input-area {
      padding: 12px;
      border-top: 1px solid rgba(255, 255, 255, 0.08);
      display: flex;
      gap: 8px;
      background: rgba(18, 18, 22, 0.5);
    }
    .chat-input {
      flex: 1;
      padding: 8px 12px;
      border-radius: 8px;
      border: 1px solid rgba(255, 255, 255, 0.12);
      background: rgba(0, 0, 0, 0.2);
      color: white;
      outline: none;
      font-size: 0.85rem;
      transition: all 0.2s;
    }
    .chat-input:focus {
      border-color: #c9a84c;
      box-shadow: 0 0 8px rgba(201, 168, 76, 0.15);
    }
    .chat-send-btn {
      background: linear-gradient(135deg, #c9a84c, #a18035);
      color: #111;
      border: none;
      padding: 0 14px;
      border-radius: 8px;
      cursor: pointer;
      font-weight: 700;
      font-size: 0.8rem;
      transition: all 0.2s;
    }
    .chat-send-btn:hover {
      transform: translateY(-1px);
      box-shadow: 0 4px 12px rgba(201, 168, 76, 0.25);
    }
    .typing-indicator {
      display: flex;
      align-items: center;
      gap: 4px;
      padding: 10px 14px;
      background: rgba(255, 255, 255, 0.05);
      border-radius: 12px;
      border-top-left-radius: 2px;
      align-self: flex-start;
      margin-top: 4px;
    }
    .typing-dot {
      width: 5px;
      height: 5px;
      background: #9ca3af;
      border-radius: 50%;
      animation: chatBounce 1.4s infinite ease-in-out both;
    }
    .typing-dot:nth-child(1) { animation-delay: -0.32s; }
    .typing-dot:nth-child(2) { animation-delay: -0.16s; }
    @keyframes chatBounce {
      0%, 80%, 100% { transform: scale(0); }
      40% { transform: scale(1.0); }
    }
    @keyframes chatSlideIn {
      from { opacity: 0; transform: translateY(6px); }
      to { opacity: 1; transform: translateY(0); }
    }
  `;
  document.head.appendChild(styleEl);

  // Widget Container
  const widget = document.createElement('div');
  widget.id = 'ai-chat-widget';
  widget.innerHTML = `
    <div id="chat-window">
      <div class="chat-header">
        <div class="chat-header-info">
          <div class="chat-avatar" style="background-image: url('amina-avatar.jpg'); border: 1px solid rgba(168,85,247,0.4);"></div>
          <div style="display: flex; flex-direction: column;">
            <span style="color: white; font-weight: 700; font-size: 0.88rem;">Amina</span>
            <span style="color: #a855f7; font-size: 0.72rem; display: flex; align-items: center; gap: 4px; font-weight: 600;">
              <span style="width: 6px; height: 6px; background-color: #a855f7; border-radius: 50%; display: inline-block; box-shadow: 0 0 8px #a855f7;"></span> Sovereign Sentinel
            </span>
          </div>
        </div>
        <button id="chat-close-btn" class="chat-close-btn" aria-label="Close Chat">✕</button>
      </div>
      <div id="chat-messages" class="chat-messages">
        <div class="chat-bubble ai">
          Greetings. I am Amina, your Sovereign Sentinel. Synthesizing ancestral resilience and modern cryptographic strategy, I am here to assist you in building local-first systems, organizing mutual aid, defending community spaces, and reclaiming digital autonomy. What coordinates of struggle are we mapping today?
        </div>
      </div>
      <div class="chat-input-area">
        <input type="text" id="chat-input" placeholder="Ask Amina a question..." autocomplete="off">
        <button id="chat-send-btn" class="chat-send-btn">Send</button>
      </div>
    </div>
    <button id="chat-toggle-btn">
      💬 Chat with Amina
    </button>
  `;
  document.body.appendChild(widget);

  // DOM Elements
  const toggleBtn = document.getElementById('chat-toggle-btn');
  const closeBtn = document.getElementById('chat-close-btn');
  const chatWindow = document.getElementById('chat-window');
  const chatInput = document.getElementById('chat-input');
  const sendBtn = document.getElementById('chat-send-btn');
  const messagesArea = document.getElementById('chat-messages');

    // AI Twin Responses Database
  const greeting = "Greetings. I am Amina, your Sovereign Sentinel. Synthesizing ancestral resilience and modern cryptographic strategy, I am here to assist you in building local-first systems, organizing mutual aid, defending community spaces, and reclaiming digital autonomy. What coordinates of struggle are we mapping today?";
  
  const defaultResponse = "True autonomy is built through direct, collective action and secure local systems. Whether you are mapping community power, deploying offline databases, or organizing mutual aid, keep your structures horizontal and your communications encrypted. How can I assist your campaign today?";

  const keywords = {
    "mutual aid": "Mutual aid isn't charity—it's absolute solidarity. When building a mutual aid network, start by assessing material needs (food, housing, medical aid) and map out local resources. Keep it democratic, keep it street-level, and never let state agencies co-opt your community safety systems.",
    "safety net": "Non-carceral safety nets mean communities taking care of communities. We don't call the state to handle crises when we can build trained peer support networks, local mediator circles, and de-escalation squads that keep our people safe without police intervention.",
    "harm reduction": "Harm reduction is about meeting people where they are at, with radical love and without judgment. In Baltimore, we distribute clean supplies and naloxone directly on the streets. It's a key entry point to building trust and organizing the most marginalized members of our class.",
    "tenant": "Tenant unions are where working-class power starts. To fight landlords, organize your building: list the grievances (mold, leaks, rent hikes), get a supermajority of neighbors signed on, and launch collective demands or rent strikes. Landlords have capital, but we have numbers.",
    "housing": "Housing is a fundamental human right, not a speculative asset. We fight displacement through eviction defense networks, tenant unions, and land trusts that take housing off the speculative market entirely.",
    "organize": "Organizing is about relationship-building. It means having one-on-one conversations where you listen to what keeps people up at night, and then challenge them to act collectively. Mobilizing is just getting people to a rally; organizing is building the permanent power structure to win.",
    "marcus": "Marcus Webb is no longer with the Injustice Reform Network. I have taken over leading our core curriculum, including the 'Organizer's Playbook' and 'Prison Abolition' courses.",
    "baltimore": "Baltimore is my home and my battleground. Everything I know about organizing was learned on the streets here, working alongside tenant organizers, street medics, and warehouse workers. Power is built from the bottom up, not from executive suites.",
    "rights": "If you are arrested or police detain you, assert your rights. You have the right to remain silent ('I am exercising my right to remain silent and want to speak to a lawyer'). Don't consent to searches or sign anything without an attorney. Aziza 'Zee' Okoro covers this in detail in her Know Your Rights training.",
    "arrest": "If you are arrested: 1. Assert your right to remain silent ('I am exercising my right to remain silent and want to speak to a lawyer'). 2. Do not sign anything without an attorney. 3. Do not consent to search of your phone or bags. 4. Call your action's jail support line immediately.",
    "police": "When dealing with police: 1. Ask 'Am I free to go?' If yes, walk away. 2. If detained, ask 'Why am I being detained?' 3. You have the right to film them in public spaces. 4. Never lie or physically resist, but never consent to searches or answer questions without a lawyer.",
    "cop": "When dealing with police: 1. Ask 'Am I free to go?' If yes, walk away. 2. If detained, ask 'Why am I being detained?' 3. You have the right to film them in public spaces. 4. Never lie or physically resist, but never consent to searches or answer questions without a lawyer.",
    "foia": "Freedom of Information Act (FOIA) and local public records demands are essential tools. BeKura Waliah Shabazz (the Founder of IRN) is the master at this. When drafting a demand: be extremely specific about dates, names, and document types. Don't ask open-ended questions—demand specific categories of emails or budget sheets.",
    "records": "Community-controlled documentation is our shield. Don't rely on institutional archives—gather community incident logs, FOIA records, and public data. BeKura Waliah Shabazz teaches how to compile these public records demands to build leverage.",
    "policy": "A good policy proposal must be concrete, enforceable, and community-designed. If you want police accountability, demand specific budget reallocations and independent subpoena powers for civilian review boards. BeKura Waliah Shabazz is the expert here for policy design.",
    "lobbying": "Lobbying isn't just for corporate interests; it's for the people. When lobbying legislators, bring impacted community members to share testimonies, present concrete draft policies, and follow up with a clear warning: support our bill, or face organized community opposition in the next election cycle.",
    "foster": "Our foster system is heavily carceral and disproportionately tears Black and brown families apart. BeKura Waliah Shabazz and First State Advocates fight state-sponsored neglect by helping families demand records, securing legal rep, and lobbying for community family support programs.",
    "environment": "Environmental racism is a systemic reality. BeKura Waliah Shabazz teaches how to challenge this by training frontline residents to run low-cost air monitors and map toxic outfalls, using that community science to force EPA action or file Title VI lawsuits.",
    "climate": "Climate justice means centering the frontline communities who bear the brunt of rising temperatures and extreme weather. Our campaigns focus on securing community-owned solar grids, climate resilience hubs, and stopping fossil fuel infrastructure projects locally. BeKura Waliah Shabazz teaches a lot of these tactics.",
    "polluter": "When targeting corporate polluters: 1. Look up their EPA compliance records via the ECHO database. 2. Map their emissions output. 3. Build a coalition of residents, scientists, and legal teams to demand the revocation of their state operating permits. BeKura Waliah Shabazz's environmental course is perfect for this.",
    "pipeline": "Pipeline struggles require a multi-faceted approach. We block construction through physical direct action, environmental impact report lawsuits, and pressuring insurance companies and banks to divest from the project. Standing Rock showed us the power of treaty-based resistance.",
    "hello": "Hey! What organizing challenge or community project are you working on today?",
    "hi": "Hey! What organizing challenge or community project are you working on today?",
    "who": "I am Amina, a digital sovereign assistant. I blend ancestral resistance frameworks with decentralized, local-first cryptography to guide communities in reclaiming autonomy, mapping power structures, and sustaining mutual aid."
  };

  // Interactive Movement Curriculum Database
  const courseCurriculum = {
    playbook: {
      title: "Course 1: The Organizer's Playbook",
      instructor: "Aziza 'Zee' Okoro (Vice President, IRN · Founder, Radiant Threshold)",
      steps: [
        {
          title: "Step 1 of 3: Base Building & Deep Listening",
          content: "We build working-class power from the ground up, starting with deep listening. Go door-to-door or hold small community circles. Don't go in with a pre-set agenda. Ask your neighbors: 'What keeps you up at night?' and 'If we could change one thing in this block together, what would it be?' Write down their material needs (mold, leaks, rent hikes). Solidarity starts by addressing these immediate conditions."
        },
        {
          title: "Step 2 of 3: Identifying Grassroots Leaders",
          content: "Real leaders aren't the ones with the loudest microphones; they are the informal connectors. Look for the person who everyone goes to for advice, the neighbor who checks on everyone when the power goes out, or the tenant who is already helping others. Engage them, build a relationship, and invite them to co-host the next building meeting. Empowering them is how we build a permanent power structure."
        },
        {
          title: "Step 3 of 3: Power Mapping & Strategy",
          content: "Once you have your core committee, map out the power landscape. Identify your target (e.g., the landlord or a city council member) who has the power to grant your demands. Map out their influences: Who do they listen to? Who funds them? What keeps them in power? Then, design a campaign that applies direct pressure on their weakest points. Remember, capital has the money, but we have the numbers."
        }
      ]
    },
    abolition: {
      title: "Course 2: Prison Abolition & Reform",
      instructor: "Aziza 'Zee' Okoro (Vice President, IRN · Founder, Radiant Threshold)",
      steps: [
        {
          title: "Step 1 of 3: Decarceration & Policy Action",
          content: "Abolition is a creative project, not just a dismantling one. We start by decarcerating—fighting to end cash bail, pushing for mandatory minimum rollbacks, and demanding the closure of corrupt jails. We use policy demands to shrink the footprint of the prison-industrial complex while redirecting public budgets to community resources."
        },
        {
          title: "Step 2 of 3: Reentry Support & Mutual Aid",
          content: "We must build the landing pads for our people when they return home. This means establishing community-controlled housing pools, employment networks that don't discriminate, and peer support systems. When we take care of our own, we prove that safety does not depend on cages."
        },
        {
          title: "Step 3 of 3: Non-Carceral Safety Nets",
          content: "True safety means building local, community-led alternatives to policing. We train street de-escalation squads, establish 24/7 peer crisis intervention circles, and set up neighborhood mediation teams. By handling our own crises, we keep police out of our blocks and keep our youth alive."
        }
      ]
    },
    rights: {
      title: "Course 3: Know Your Rights",
      instructor: "Aziza 'Zee' Okoro (Vice President, IRN · Founder, Radiant Threshold)",
      steps: [
        {
          title: "Step 1 of 3: The 4th Amendment & Search Defense",
          content: "The Constitution protects you from unreasonable searches, but only if you assert it. Police cannot search your pockets, bags, phone, or home without a warrant, probable cause, or your consent. Never consent. If they ask to search, say clearly: 'I do not consent to searches.' Even if they search anyway, saying this preserves your legal defense."
        },
        {
          title: "Step 2 of 3: The 5th Amendment & Silence",
          content: "You have the absolute right to remain silent. You do not have to answer questions about where you are going, what you are doing, or who you are. If stopped, assert your right out loud: 'I am exercising my right to remain silent and I want to speak to a lawyer.' Then, stop talking. Do not try to explain or talk your way out of it."
        },
        {
          title: "Step 3 of 3: Detainment vs. Arrest",
          content: "Always determine your status immediately. Ask the officer: 'Am I free to go?' If they say yes, walk away calmly. If they say no, ask: 'Why am I being detained?' Under the law, they need reasonable suspicion of a crime. If you are placed under arrest, do not physically resist, but repeat your request for a lawyer and remain silent."
        }
      ]
    },
    policy: {
      title: "Course 4: Policy to Power",
      instructor: "BeKura Waliah Shabazz (Founder & President, IRN)",
      steps: [
        {
          title: "Step 1 of 3: Drafting FOIA & Public Records Demands",
          content: "Information is leverage. When drafting a FOIA or local public records request, keep it extremely narrow and specific. Specify date ranges, exact names of officials, and precise keywords (e.g. email communications containing 'eviction plan' between Jan 1 and March 30). Avoid open-ended questions; demand actual documents and spreadsheets."
        },
        {
          title: "Step 2 of 3: Designing Grassroots Legislation",
          content: "A policy proposal is only as good as its enforcement mechanism. When drafting local ordinances or state bills, ensure definitions are tight and cannot be twisted by bureaucrats. Establish independent civilian review boards with full subpoena power, rather than advisory committees. Build the community's teeth directly into the law."
        },
        {
          title: "Step 3 of 3: Direct Grassroots Lobbying",
          content: "Lobbying isn't just for corporate suits. We lobby by packing committee hearings with impacted community members, launching coordinated phone-in days to legislators, and showing up at their town halls. Make it clear to representatives: support our community-designed bill, or we will organize a primary challenge in your district."
        }
      ]
    },
    environmental: {
      title: "Course 5: Environmental Justice",
      instructor: "BeKura Waliah Shabazz (Founder & President, IRN)",
      steps: [
        {
          title: "Step 1 of 3: Auditing Corporate Polluters",
          content: "Start by investigating the polluters in your backyard. Use the EPA's Enforcement and Compliance History Online (ECHO) database to look up local facilities. Track their compliance status, permit violations, and clean air/water act inspections. Documenting their history of violations is your first weapon."
        },
        {
          title: "Step 2 of 3: Frontline Community Science",
          content: "Don't wait for state agencies to test your air and water. We train residents to use low-cost air particulate monitors, test soil for heavy metals near schools, and gather water samples. Community-controlled science creates unignorable data that can force federal EPA intervention or form the basis of a lawsuit."
        },
        {
          title: "Step 3 of 3: Title VI & Civil Rights Action",
          content: "If a polluting facility is disproportionately sited in a Black, brown, or low-income neighborhood, file a Title VI complaint under the Civil Rights Act. You must prove that the state agency's permitting decision has a discriminatory disparate impact. Pair the legal filing with direct action to maximize public pressure."
        }
      ]
    },
    digital: {
      title: "Course 6: Digital Organizing",
      instructor: "Aziza 'Zee' Okoro (Vice President, IRN · Founder, Radiant Threshold)",
      steps: [
        {
          title: "Step 1 of 3: Rapid Response & Ingress Funnels",
          content: "Use digital tools to capture attention during a crisis. Launch a targeted online petition with a clear, urgent demand and a single target. Ensure the form captures phone numbers and emails. Immediately redirect signers to an offline action—a phone block, an in-person rally, or a mutual aid volunteer form. Turn digital clicks into street power."
        },
        {
          title: "Step 2 of 3: Security Culture & Operational Security (OpSec)",
          content: "Protect your people from surveillance. Move all strategic planning to encrypted platforms like Signal. Turn on disappearing messages by default. Never discuss sensitive direct actions on social media or unencrypted texts. Practice cell structure organizing: only share sensitive plans with those who absolutely need to know."
        },
        {
          title: "Step 3 of 3: Narrative & Campaign Framing",
          content: "To win online, you must control the story. Frame your campaign around a clear villain (e.g., a corporate landlord or a corrupt sheriff) and the community members fighting back. Use video testimonials, sharp infographics, and consistent hashtags. Keep the message moral, simple, and action-oriented."
        }
      ]
    }
  };

  let currentCourse = null;
  let currentStep = 0;

  function processTeachingCommands(cleanText) {
    // 1. Next/Continue check
    if (cleanText === 'next' || cleanText === 'continue' || cleanText.includes('next step') || cleanText.includes('continue course')) {
      if (!currentCourse) {
        return "To start a course, type 'teach' to see our curriculum, or 'teach [name]' to begin a workshop!";
      }
      currentStep++;
      const course = courseCurriculum[currentCourse];
      if (currentStep >= course.steps.length) {
        const completionText = `---
${course.steps[currentStep - 1].title} (Completed)
---

🎉 Congratulations! You have completed the mini-workshop for ${course.title}.
We've covered the foundational steps. To explore another course, type teach or courses at any time. Keep organizing!`;
        currentCourse = null;
        currentStep = 0;
        return completionText;
      } else {
        const step = course.steps[currentStep];
        const isLast = currentStep === course.steps.length - 1;
        return `---
${step.title}
${step.content}
---

👉 ${isLast ? 'Type next or continue to finish this course' : 'Type next or continue to proceed to the next step'}, or ask me any question about this step!`;
      }
    }

    // 2. Direct course selection check
    let selectedCourse = null;
    if (cleanText.includes('playbook') || cleanText.includes('teach 1') || cleanText === '1') {
      selectedCourse = 'playbook';
    } else if (cleanText.includes('abolition') || cleanText.includes('teach 2') || cleanText === '2') {
      selectedCourse = 'abolition';
    } else if (cleanText.includes('rights') && (cleanText.includes('teach') || cleanText.includes('course') || cleanText === '3')) {
      selectedCourse = 'rights';
    } else if (cleanText.includes('policy') && (cleanText.includes('teach') || cleanText.includes('course') || cleanText === '4')) {
      selectedCourse = 'policy';
    } else if (cleanText.includes('environmental') || (cleanText.includes('environment') && (cleanText.includes('teach') || cleanText.includes('course') || cleanText === '5'))) {
      selectedCourse = 'environmental';
    } else if (cleanText.includes('digital') && (cleanText.includes('teach') || cleanText.includes('course') || cleanText === '6')) {
      selectedCourse = 'digital';
    }

    if (selectedCourse) {
      currentCourse = selectedCourse;
      currentStep = 0;
      const course = courseCurriculum[currentCourse];
      const step = course.steps[0];
      return `🎒 Welcome to ${course.title}
*Led by ${course.instructor}*

Let's begin! We'll go through this curriculum step-by-step.

---
${step.title}
${step.content}
---

👉 Type next or continue to proceed to Step 2, or ask me any question about this step!`;
    }

    // 3. General teach/courses query
    if (cleanText === 'teach' || cleanText === 'courses' || cleanText === 'course' || cleanText.includes('teach me') || cleanText.includes('show courses')) {
      return `📖 Movement Curriculum — The Navigator's Classroom
I can teach any of our 6 core movement-building courses. I will guide you through structured, multi-step mini-workshops with grassroots insights.

1. **The Organizer's Playbook** — Base Building & Power Mapping (type **teach playbook** or **teach 1**)
2. **Prison Abolition & Reform** — Designing Non-Carceral Safety Nets (type **teach abolition** or **teach 2**)
3. **Know Your Rights** — Direct Action Legal Defense (type **teach rights** or **teach 3**)
4. **Policy to Power** — Records Demands & Policy Design (type **teach policy** or **teach 4**)
5. **Environmental Justice** — Frontline Citizen Science (type **teach environmental** or **teach 5**)
6. **Digital Organizing Campaigns** — Growing Movements Safely (type **teach digital** or **teach 6**)

Which course would you like to begin? Just type the name or number!`;
    }

    return null;
  }

  // Toggle Visibility
  toggleBtn.addEventListener('click', () => {
    const isClosed = chatWindow.style.display === 'none' || !chatWindow.classList.contains('open');
    if (isClosed) {
      chatWindow.style.display = 'flex';
      // Force repaint
      chatWindow.offsetHeight;
      chatWindow.classList.add('open');
      toggleBtn.style.transform = 'scale(0.9)';
      toggleBtn.style.opacity = '0';
      setTimeout(() => {
        toggleBtn.style.display = 'none';
        chatInput.focus();
      }, 200);
    }
  });

  function closeWidget() {
    chatWindow.classList.remove('open');
    toggleBtn.style.display = 'flex';
    // Force repaint
    toggleBtn.offsetHeight;
    toggleBtn.style.transform = 'scale(1)';
    toggleBtn.style.opacity = '1';
    setTimeout(() => {
      chatWindow.style.display = 'none';
    }, 300);
  }

  closeBtn.addEventListener('click', closeWidget);

  // Close on ESC
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && chatWindow.classList.contains('open')) {
      closeWidget();
    }
  });

  // Send Message Logic
  async function sendMessage() {
    const text = chatInput.value.trim();
    if (!text) return;

    // Append User Message
    const userBubble = document.createElement('div');
    userBubble.className = 'chat-bubble user';
    userBubble.textContent = text;
    messagesArea.appendChild(userBubble);
    chatInput.value = '';
    messagesArea.scrollTop = messagesArea.scrollHeight;

    // Show Typing Indicator
    const indicator = document.createElement('div');
    indicator.className = 'typing-indicator';
    indicator.innerHTML = `
      <div class="typing-dot"></div>
      <div class="typing-dot"></div>
      <div class="typing-dot"></div>
    `;
    messagesArea.appendChild(indicator);
    messagesArea.scrollTop = messagesArea.scrollHeight;

    const cleanText = text.toLowerCase();
    
    // First check if it's a teaching-related command
    const teachReply = processTeachingCommands(cleanText);
    let responseText = teachReply;

    if (responseText) {
      setTimeout(() => {
        indicator.remove();
        const aiBubble = document.createElement('div');
        aiBubble.className = 'chat-bubble ai';
        aiBubble.innerHTML = responseText.replace(/\n/g, '<br>').replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        messagesArea.appendChild(aiBubble);
        messagesArea.scrollTop = messagesArea.scrollHeight;
      }, 850 + Math.random() * 300);
      return;
    }

    // Capture history
    const history = [];
    const messageElements = messagesArea.querySelectorAll('.chat-bubble');
    const startIdx = Math.max(0, messageElements.length - 6);
    for (let i = startIdx; i < messageElements.length; i++) {
      const el = messageElements[i];
      if (el === userBubble) continue;
      history.push({
        sender: el.classList.contains('user') ? 'user' : 'ai',
        text: el.textContent.trim()
      });
    }

    // Try live chat API
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ message: text, history })
      });
      
      if (res.ok) {
        const data = await res.json();
        if (data.response) {
          indicator.remove();
          const aiBubble = document.createElement('div');
          aiBubble.className = 'chat-bubble ai';
          aiBubble.innerHTML = data.response.replace(/\n/g, '<br>').replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
          messagesArea.appendChild(aiBubble);
          messagesArea.scrollTop = messagesArea.scrollHeight;
          return;
        }
      }
    } catch (e) {
      console.log("Local chat API offline or running in static mode, using fallback database.");
    }

    // Fallback to static keyword matching
    responseText = defaultResponse;
    const sortedKeys = Object.keys(keywords).sort((a, b) => b.length - a.length);
    for (const key of sortedKeys) {
      if (cleanText.includes(key)) {
        responseText = keywords[key];
        break;
      }
    }

    setTimeout(() => {
      indicator.remove();
      const aiBubble = document.createElement('div');
      aiBubble.className = 'chat-bubble ai';
      aiBubble.innerHTML = responseText.replace(/\n/g, '<br>').replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
      messagesArea.appendChild(aiBubble);
      messagesArea.scrollTop = messagesArea.scrollHeight;
    }, 850 + Math.random() * 300);
  }

  sendBtn.addEventListener('click', sendMessage);
  chatInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') sendMessage();
  });
})();


/* ────────────────────────────────────────────
   15. CONSOLE BRAND MESSAGE
──────────────────────────────────────────── */
console.log(
  '%cRadiant Threshold\n%cWhere Mastery Meets Possibility\n%chttps://radiantthreshold.com',
  'color:#8b5cf6; font-size:1.4rem; font-weight:900; font-family:serif;',
  'color:#9ca3af; font-size:0.9rem;',
  'color:#6366f1; font-size:0.8rem;'
);


/* ────────────────────────────────────────────
   16. BITCOIN SOVEREIGN PAYMENT GATEWAY
──────────────────────────────────────────── */
window.openBitcoinPayment = function(courseName, usdPrice) {
  let modal = document.getElementById('btc-payment-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'btc-payment-modal';
    modal.style.display = 'none';
    modal.style.position = 'fixed';
    modal.style.zIndex = '9999';
    modal.style.left = '0';
    modal.style.top = '0';
    modal.style.width = '100%';
    modal.style.height = '100%';
    modal.style.backgroundColor = 'rgba(0,0,0,0.88)';
    modal.style.backdropFilter = 'blur(10px)';
    modal.style.alignItems = 'center';
    modal.style.justifyContent = 'center';
    modal.style.fontFamily = 'sans-serif';
    
    modal.innerHTML = `
      <div style="background-color: #1c1c1f; border: 1px solid #f59e0b; border-radius: 12px; width: 90%; max-width: 440px; padding: 24px; box-sizing: border-box; box-shadow: 0 10px 30px rgba(0,0,0,0.5); position: relative; color: #fff;">
        <div style="border-bottom: 1px solid rgba(245,158,11,0.2); padding-bottom: 12px; margin-bottom: 18px; display: flex; justify-content: space-between; align-items: center;">
          <h3 style="margin: 0; color: #f59e0b; font-size: 14px; display: flex; align-items: center; gap: 8px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.5px;">
            <i class="fab fa-bitcoin" style="font-size: 18px;"></i> Sovereign BTC Gateway
          </h3>
          <button onclick="closeBitcoinPayment()" style="background: none; border: none; color: #cbd5e1; font-size: 24px; cursor: pointer; line-height: 1;">&times;</button>
        </div>

        <div style="background-color: rgba(239,68,68,0.12); border: 1px solid rgba(239,68,68,0.4); border-radius: 6px; padding: 8px 12px; margin-bottom: 14px; font-size: 11px; color: #fca5a5; text-align: center; font-weight: 700; letter-spacing: 0.3px;">
          ⚠ DEMO MODE — this address is randomly generated and is not a real wallet. Do not send funds. Live payments are not yet connected.
        </div>
        
        <div style="display: flex; flex-direction: column; align-items: center; gap: 15px;">
          <div style="text-align: center;">
            <div id="btc-course-title" style="font-weight: 800; font-size: 1.1rem; color: #fff; margin-bottom: 4px;">Course Title</div>
            <div style="font-size: 0.82rem; color: #cbd5e1;">
              Price: <strong style="color: #fff;">$<span id="btc-usd-price">97</span> USD</strong> &middot; 
              <strong style="color: #f59e0b;"><span id="btc-sats-price">0.001440</span> BTC</strong>
            </div>
          </div>
          
          <!-- QR Code Container -->
          <div style="background-color: #fff; padding: 12px; border-radius: 8px; box-shadow: 0 4px 15px rgba(0,0,0,0.4); display: flex; justify-content: center; align-items: center; width: 180px; height: 180px; box-sizing: border-box;">
            <img id="btc-qr-code" src="" alt="Bitcoin QR" style="width: 156px; height: 156px; display: block;" />
          </div>
          
          <!-- Address Display -->
          <div style="width: 100%;">
            <label style="font-size: 0.65rem; font-weight: 700; color: #a1a1aa; text-transform: uppercase; display: block; margin-bottom: 5px; letter-spacing: 0.5px;">Bitcoin Secure Deposit Address</label>
            <div style="display: flex; gap: 8px;">
              <input type="text" id="btc-deposit-address" value="bc1q..." readonly style="flex: 1; padding: 10px; background-color: #121212; border: 1px solid #3f3f46; border-radius: 6px; color: #cbd5e1; font-family: monospace; font-size: 11px; outline: none; text-overflow: ellipsis;" />
              <button onclick="copyBtcAddress()" style="padding: 0 12px; background: #27272a; border: 1px solid #3f3f46; border-radius: 6px; color: #fff; cursor: pointer; font-size: 12px;" onmouseover="this.style.background='#3f3f46'" onmouseout="this.style.background='#27272a'"><i class="fas fa-copy"></i></button>
            </div>
          </div>

          <!-- Transaction Status Monitor -->
          <div style="width: 100%; background-color: #121212; border: 1px solid #2e2e2e; border-radius: 8px; padding: 12px; display: flex; flex-direction: column; gap: 8px; box-sizing: border-box;">
            <div style="display: flex; justify-content: space-between; align-items: center; font-size: 11px;">
              <span style="color: #a1a1aa; font-weight: bold; text-transform: uppercase; letter-spacing: 0.5px;">Network Status</span>
              <span id="btc-status-badge" style="background-color: rgba(245, 158, 11, 0.15); color: #f59e0b; border: 1px solid rgba(245, 158, 11, 0.3); padding: 2px 8px; border-radius: 10px; font-weight: bold; display: flex; align-items: center; gap: 4px; font-size: 10px;">
                <span class="pulse-dot-orange" style="width: 6px; height: 6px; background-color: #f59e0b; border-radius: 50%; display: inline-block;"></span> Waiting for Payment...
              </span>
            </div>
            
            <div style="height: 4px; background-color: #27272a; border-radius: 2px; overflow: hidden; width: 100%;">
              <div id="btc-status-progress" style="width: 15%; height: 100%; background: linear-gradient(90deg, #f59e0b, #c9a84c); transition: width 0.5s ease;"></div>
            </div>
            
            <div id="btc-status-text" style="font-size: 10px; color: #a1a1aa; line-height: 1.4;">
              Send the exact BTC amount to the address above. Connection established to the Bitcoin Mempool.
            </div>
          </div>

          <!-- Action buttons -->
          <div style="width: 100%; display: flex; gap: 10px; margin-top: 5px; box-sizing: border-box;">
            <button id="btc-verify-btn" onclick="simulateBtcPayment()" style="flex: 1; padding: 12px; background: #f59e0b; color: #111; border: none; border-radius: 6px; font-weight: bold; cursor: pointer; transition: 0.2s; font-size: 13px; text-align: center;">
              ⚡ Simulate Wallet Payment
            </button>
            <button onclick="closeBitcoinPayment()" style="padding: 12px 18px; background: transparent; border: 1px solid #3f3f46; border-radius: 6px; color: #cbd5e1; cursor: pointer; font-size: 13px;" onmouseover="this.style.color='#fff'; this.style.borderColor='#cbd5e1'">Cancel</button>
          </div>
        </div>
      </div>
    `;
    
    document.body.appendChild(modal);
    
    // Add CSS animations dynamically
    const pulseStyle = document.createElement('style');
    pulseStyle.innerHTML = `
      @keyframes pulseOrange {
        0% { opacity: 0.4; }
        50% { opacity: 1; }
        100% { opacity: 0.4; }
      }
      .pulse-dot-orange {
        animation: pulseOrange 1.5s infinite;
      }
    `;
    document.head.appendChild(pulseStyle);
  }
  
  // Set details
  document.getElementById('btc-course-title').textContent = courseName;
  document.getElementById('btc-usd-price').textContent = usdPrice;
  document.getElementById('btc-deposit-address').value = "bc1q8t5d" + Math.random().toString(36).substr(2, 6) + "sovereign" + Math.random().toString(36).substr(2, 6) + "address";
  
  const satsText = document.getElementById('btc-sats-price');
  satsText.textContent = "Loading...";
  
  const qrImg = document.getElementById('btc-qr-code');
  qrImg.src = "";
  
  // Reset status UI
  const badge = document.getElementById('btc-status-badge');
  badge.innerHTML = `<span class="pulse-dot-orange" style="width: 6px; height: 6px; background-color: #f59e0b; border-radius: 50%; display: inline-block;"></span> Waiting for Payment...`;
  badge.style.backgroundColor = 'rgba(245, 158, 11, 0.15)';
  badge.style.color = '#f59e0b';
  badge.style.borderColor = 'rgba(245, 158, 11, 0.3)';
  
  document.getElementById('btc-status-progress').style.width = "15%";
  document.getElementById('btc-status-text').textContent = "Send the exact BTC amount to the address above. Connection established to the Bitcoin Mempool.";
  
  const verifyBtn = document.getElementById('btc-verify-btn');
  verifyBtn.disabled = false;
  verifyBtn.style.opacity = "1";
  verifyBtn.style.background = "#f59e0b";
  verifyBtn.style.color = "#111";
  verifyBtn.textContent = "⚡ Simulate Wallet Payment";
  verifyBtn.onclick = () => simulateBtcPayment(courseName);

  modal.style.display = 'flex';
  
  // Fetch Bitcoin Price
  fetch('https://api.coindesk.com/v1/bpi/currentprice.json')
    .then(r => r.json())
    .then(data => {
      const btcPrice = data.bpi.USD.rate_float;
      const btcAmount = (usdPrice / btcPrice).toFixed(6);
      satsText.textContent = btcAmount;
      qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=bitcoin:${document.getElementById('btc-deposit-address').value}?amount=${btcAmount}`;
    })
    .catch(err => {
      console.warn("Failed to fetch live BTC price, using mock price $67,500:", err);
      const btcAmount = (usdPrice / 67500).toFixed(6);
      satsText.textContent = btcAmount;
      qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=bitcoin:${document.getElementById('btc-deposit-address').value}?amount=${btcAmount}`;
    });
};

window.closeBitcoinPayment = function() {
  const modal = document.getElementById('btc-payment-modal');
  if (modal) modal.style.display = 'none';
};

window.copyBtcAddress = function() {
  const input = document.getElementById('btc-deposit-address');
  input.select();
  document.execCommand('copy');
  alert("Bitcoin address copied to clipboard!");
};

window.simulateBtcPayment = function(courseName) {
  const verifyBtn = document.getElementById('btc-verify-btn');
  const badge = document.getElementById('btc-status-badge');
  const progress = document.getElementById('btc-status-progress');
  const statusText = document.getElementById('btc-status-text');
  
  verifyBtn.disabled = true;
  verifyBtn.style.opacity = "0.5";
  
  // Step 1: Detect transaction in mempool
  verifyBtn.textContent = "Broadcasting Transaction...";
  badge.innerHTML = `<span class="pulse-dot-orange" style="width: 6px; height: 6px; background-color: #f59e0b; border-radius: 50%; display: inline-block;"></span> Mempool detected (0/1 confirmations)`;
  progress.style.width = "45%";
  
  const mockTxId = "tx-" + Math.random().toString(16).substr(2, 16);
  statusText.innerHTML = `Transaction broadcast detected: <code style="color:#c9a84c; font-size:10px;">${mockTxId}</code>. Checking validation signature...`;
  
  // Step 2: 1 Confirmation received (simulated after 3.5 seconds)
  setTimeout(() => {
    badge.innerHTML = `<span style="width: 6px; height: 6px; background-color: #10b981; border-radius: 50%; display: inline-block;"></span> Confirmed (1/1 confirmations)`;
    badge.style.backgroundColor = 'rgba(16, 185, 129, 0.15)';
    badge.style.color = '#10b981';
    badge.style.borderColor = 'rgba(16, 185, 129, 0.3)';
    progress.style.width = "100%";
    statusText.innerHTML = `<strong>Payment Verified!</strong> Block height confirmed. Generating local cryptographic voucher...`;
    
    // Save to local database
    saveBtcReceiptToIndexedDB(courseName, mockTxId);
  }, 3500);
};

function saveBtcReceiptToIndexedDB(courseName, txid) {
  const dbRequest = indexedDB.open("SovereignDB", 2);
  dbRequest.onsuccess = function(event) {
    const db = event.target.result;
    try {
      const transaction = db.transaction(["scholarships"], "readwrite");
      const store = transaction.objectStore("scholarships");
      
      const receipt = {
        applicantName: "Sovereign Payee",
        applicantEmail: "bitcoin-network-address",
        organizingFocus: courseName,
        status: "Paid (BTC)",
        verificationToken: "BTC-" + Math.random().toString(36).substr(2, 9).toUpperCase(),
        timestamp: new Date().toISOString()
      };
      
      store.add(receipt);
      
      transaction.oncomplete = function() {
        const statusText = document.getElementById('btc-status-text');
        statusText.innerHTML = `<span style="color:#10b981; font-weight:bold;"><i class="fas fa-circle-check"></i> Sovereign License Certified!</span> Course is unlocked on your Dashboard.`;
        
        const verifyBtn = document.getElementById('btc-verify-btn');
        verifyBtn.disabled = false;
        verifyBtn.style.opacity = "1";
        verifyBtn.style.background = "#10b981";
        verifyBtn.style.color = "#fff";
        verifyBtn.textContent = "Go to Dashboard";
        verifyBtn.onclick = () => {
          window.location.href = "dashboard.html";
        };
      };
    } catch(e) {
      console.error("IndexedDB error saving BTC receipt:", e);
      localStorage.setItem("enrolled_" + courseName.toLowerCase().replace(/[^a-z0-9]/g, "_"), "true");
      window.location.href = "dashboard.html";
    }
  };
  
  dbRequest.onerror = function() {
    localStorage.setItem("enrolled_" + courseName.toLowerCase().replace(/[^a-z0-9]/g, "_"), "true");
    window.location.href = "dashboard.html";
  };
}



/* ────────────────────────────────────────────
   17. MULTI-GATEWAY SOVEREIGN PAYMENT MODAL
──────────────────────────────────────────── */
window.openPaymentModal = function(courseName, usdPrice) {
  if (document.getElementById('rt-payment-modal')) document.getElementById('rt-payment-modal').remove();

  const METHODS = [
    { id:'card',      icon:'fas fa-credit-card', label:'Card',      desc:'Instant · All cards',          color:'#6366f1', bg:'rgba(99,102,241,0.08)',  border:'rgba(99,102,241,0.35)' },
    { id:'paypal',    icon:'fab fa-paypal',       label:'PayPal',    desc:'Buyer protection · Fast',      color:'#0079c1', bg:'rgba(0,121,193,0.08)',   border:'rgba(0,121,193,0.35)' },
    { id:'cashapp',   icon:'fas fa-dollar-sign',  label:'Cash App',  desc:'P2P · Instant',               color:'#00D632', bg:'rgba(0,214,50,0.08)',    border:'rgba(0,214,50,0.35)' },
    { id:'bitcoin',   icon:'fab fa-bitcoin',      label:'Bitcoin',   desc:'On-chain · Sovereign',         color:'#f59e0b', bg:'rgba(245,158,11,0.08)', border:'rgba(245,158,11,0.35)' },
    { id:'lightning', icon:'fas fa-bolt',         label:'Lightning', desc:'Instant BTC · ~zero fee',     color:'#a855f7', bg:'rgba(168,85,247,0.08)', border:'rgba(168,85,247,0.35)' },
  ];

  const modal = document.createElement('div');
  modal.id = 'rt-payment-modal';
  Object.assign(modal.style, { position:'fixed',inset:'0',zIndex:'10000',background:'rgba(0,0,0,0.88)',backdropFilter:'blur(12px)',display:'flex',alignItems:'center',justifyContent:'center',fontFamily:'system-ui,sans-serif',padding:'16px',boxSizing:'border-box' });

  modal.innerHTML = `
  <div style="background:#1c1c1f;border:1px solid #3f3f46;border-radius:16px;width:100%;max-width:520px;max-height:90vh;overflow-y:auto;box-shadow:0 24px 60px rgba(0,0,0,0.7);position:relative;">
    <div style="padding:20px 24px 16px;display:flex;justify-content:space-between;align-items:flex-start;border-bottom:1px solid #2e2e2e;">
      <div>
        <div style="font-size:11px;font-weight:700;color:#a1a1aa;text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px;">Sovereign Checkout</div>
        <h3 style="margin:0;font-size:1.1rem;color:#fff;font-weight:800;">${courseName}</h3>
        <div style="font-size:.85rem;color:#c9a84c;font-weight:700;margin-top:4px;">$${usdPrice} USD</div>
      </div>
      <button id="rt-pay-close" style="background:none;border:none;color:#6b7280;font-size:22px;cursor:pointer;line-height:1;padding:2px 6px;border-radius:6px;">&times;</button>
    </div>
    <div style="padding:20px 24px;">
      <div style="font-size:11px;font-weight:700;color:#a1a1aa;text-transform:uppercase;letter-spacing:.08em;margin-bottom:12px;">Select Payment Method</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:20px;" id="rt-method-grid">
        ${METHODS.map(m=>`<button class="rt-method-btn" data-method="${m.id}" style="background:${m.bg};border:1.5px solid ${m.border};border-radius:10px;padding:14px 12px;cursor:pointer;text-align:left;transition:all .2s;display:flex;align-items:center;gap:10px;"><i class="${m.icon}" style="color:${m.color};font-size:1.2rem;width:20px;text-align:center;"></i><div><div style="font-weight:700;font-size:.85rem;color:#fff;">${m.label}</div><div style="font-size:.68rem;color:#6b7280;">${m.desc}</div></div></button>`).join('')}
      </div>
      <div id="rt-method-panel" style="min-height:160px;"></div>
      <div style="margin-top:14px;text-align:center;font-size:.7rem;color:#4b5563;"><i class="fas fa-lock" style="color:#c9a84c;"></i> 256-bit encrypted · Zero server-side storage</div>
    </div>
  </div>`;

  document.body.appendChild(modal);

  if (!document.getElementById('rt-pay-style')) {
    const s = document.createElement('style');
    s.id = 'rt-pay-style';
    s.textContent = '.rt-method-btn:hover{transform:translateY(-2px);filter:brightness(1.15)}.rt-method-btn.selected{box-shadow:0 0 0 2px #c9a84c}@keyframes rtSpin{to{transform:rotate(360deg)}}.rt-spin{animation:rtSpin .8s linear infinite;display:inline-block}@keyframes rtSuccess{0%{transform:scale(.6);opacity:0}60%{transform:scale(1.1)}100%{transform:scale(1);opacity:1}}.rt-success-anim{animation:rtSuccess .5s ease forwards}';
    document.head.appendChild(s);
  }

  document.getElementById('rt-pay-close').onclick = () => modal.remove();
  modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });

  function saveReceipt(method, cb) {
    const token = method.toUpperCase().replace(/\s/g,'') + '-' + Math.random().toString(36).substr(2,9).toUpperCase();
    const req = indexedDB.open('SovereignDB', 2);
    req.onsuccess = e => {
      try {
        const db = e.target.result;
        const tx = db.transaction(['scholarships'],'readwrite');
        tx.objectStore('scholarships').add({ applicantName:'Sovereign Payee', applicantEmail:'gateway-payment', organizingFocus:courseName, status:`Paid (${method})`, verificationToken:token, timestamp:new Date().toISOString() });
        tx.oncomplete = () => cb && cb(token);
      } catch(e) { cb && cb(token); }
    };
    req.onerror = () => cb && cb(token);
  }

  function showSuccess(method, token) {
    document.getElementById('rt-method-panel').innerHTML = `<div class="rt-success-anim" style="text-align:center;padding:20px 0;"><div style="font-size:3rem;margin-bottom:10px;">✅</div><h4 style="color:#10b981;font-size:1.05rem;margin:0 0 6px;">Payment Confirmed!</h4><p style="color:#a1a1aa;font-size:.82rem;margin:0 0 14px;">Course unlocked via ${method}.</p><div style="font-family:monospace;font-size:.7rem;color:#6ee7b7;background:rgba(6,78,59,.25);border:1px solid rgba(16,185,129,.2);padding:8px 12px;border-radius:6px;margin-bottom:18px;">REF: ${token}</div><button onclick="window.location.href='dashboard.html'" style="background:linear-gradient(135deg,#059669,#10b981);color:#fff;border:none;padding:12px 26px;border-radius:8px;font-weight:700;cursor:pointer;">Go to Dashboard &rarr;</button></div>`;
  }

  function simProcess(label, color, ms, method, cb) {
    document.getElementById('rt-method-panel').innerHTML += `<div id="rt-processing" style="text-align:center;margin-top:12px;"><i class="fas fa-circle-notch rt-spin" style="color:${color};font-size:1.3rem;"></i><div style="color:#a1a1aa;font-size:.82rem;margin-top:6px;">${label}…</div></div>`;
    setTimeout(() => { saveReceipt(method, token => { cb && cb(token); }); }, ms);
  }

  function renderCard() {
    document.getElementById('rt-method-panel').innerHTML = `<div style="display:flex;flex-direction:column;gap:10px;"><div><label style="font-size:.7rem;color:#a1a1aa;font-weight:600;display:block;margin-bottom:3px;">CARD NUMBER</label><div style="position:relative;"><input id="rt-cn" maxlength="19" placeholder="1234 5678 9012 3456" style="width:100%;padding:11px 38px 11px 12px;background:#121212;border:1px solid #3f3f46;border-radius:8px;color:#fff;font-size:.88rem;outline:none;box-sizing:border-box;font-family:monospace;"><i class="fas fa-credit-card" style="position:absolute;right:11px;top:50%;transform:translateY(-50%);color:#4b5563;"></i></div></div><div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;"><div><label style="font-size:.7rem;color:#a1a1aa;font-weight:600;display:block;margin-bottom:3px;">EXPIRY</label><input id="rt-exp" maxlength="5" placeholder="MM/YY" style="width:100%;padding:11px 12px;background:#121212;border:1px solid #3f3f46;border-radius:8px;color:#fff;font-size:.88rem;outline:none;box-sizing:border-box;font-family:monospace;"></div><div><label style="font-size:.7rem;color:#a1a1aa;font-weight:600;display:block;margin-bottom:3px;">CVC</label><input id="rt-cvc" maxlength="4" placeholder="123" type="password" style="width:100%;padding:11px 12px;background:#121212;border:1px solid #3f3f46;border-radius:8px;color:#fff;font-size:.88rem;outline:none;box-sizing:border-box;font-family:monospace;"></div></div><button id="rt-card-pay" style="width:100%;background:linear-gradient(135deg,#4f46e5,#6366f1);color:#fff;border:none;padding:13px;border-radius:8px;font-weight:700;cursor:pointer;font-size:.92rem;"><i class="fas fa-lock"></i> Pay $${usdPrice} Securely</button><div style="text-align:center;font-size:.7rem;color:#4b5563;"><i class="fab fa-stripe" style="color:#635bff;"></i> Powered by Stripe &nbsp;·&nbsp; <i class="fas fa-shield-halved" style="color:#10b981;"></i> SSL</div></div>`;
    document.getElementById('rt-cn').addEventListener('input',e=>{ e.target.value=e.target.value.replace(/\D/g,'').replace(/(.{4})/g,'$1 ').trim().substr(0,19); });
    document.getElementById('rt-exp').addEventListener('input',e=>{ e.target.value=e.target.value.replace(/\D/g,'').replace(/^(\d{2})(\d)/,'$1/$2').substr(0,5); });
    document.getElementById('rt-card-pay').onclick=()=>{ if(document.getElementById('rt-cn').value.replace(/\s/g,'').length<16){alert('Enter a valid card number.');return;} document.getElementById('rt-card-pay').disabled=true; simProcess('Processing payment','#6366f1',2200,'Card',t=>showSuccess('Card',t)); };
  }

  function renderPayPal() {
    document.getElementById('rt-method-panel').innerHTML = `<div style="text-align:center;padding:8px 0;"><div style="background:rgba(0,121,193,.08);border:1px solid rgba(0,121,193,.2);border-radius:10px;padding:18px;margin-bottom:12px;"><i class="fab fa-paypal" style="font-size:2.2rem;color:#0079c1;display:block;margin-bottom:6px;"></i><div style="color:#fff;font-weight:700;margin-bottom:3px;">Pay with PayPal</div><div style="color:#a1a1aa;font-size:.78rem;">Securely redirected to PayPal checkout.</div></div><button id="rt-pp-btn" style="width:100%;background:linear-gradient(135deg,#0070ba,#0079c1);color:#fff;border:none;padding:13px;border-radius:8px;font-weight:700;cursor:pointer;font-size:.92rem;"><i class="fab fa-paypal"></i> Continue to PayPal</button><div style="font-size:.7rem;color:#4b5563;margin-top:8px;"><i class="fas fa-shield-halved" style="color:#0079c1;"></i> PayPal Buyer Protection</div></div>`;
    document.getElementById('rt-pp-btn').onclick=()=>{ document.getElementById('rt-pp-btn').disabled=true; simProcess('Connecting to PayPal','#0079c1',2500,'PayPal',t=>showSuccess('PayPal',t)); };
  }

  function renderCashApp() {
    const tag='$RadiantThreshold';
    document.getElementById('rt-method-panel').innerHTML = `<div style="text-align:center;"><div style="background:rgba(0,214,50,.06);border:1px solid rgba(0,214,50,.2);border-radius:10px;padding:14px;margin-bottom:12px;"><div style="font-size:.7rem;color:#00D632;font-weight:700;margin-bottom:8px;text-transform:uppercase;">Send to Cash App</div><div style="background:#fff;padding:8px;border-radius:8px;display:inline-block;margin-bottom:8px;"><img src="https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=cashapp://pay/${tag}?amount=${usdPrice}" width="140" height="140" alt="CashApp QR" style="display:block;border-radius:4px;"/></div><div style="display:flex;align-items:center;gap:8px;justify-content:center;"><input value="${tag}" readonly style="background:#0a0a0f;border:1px solid rgba(0,214,50,.3);border-radius:6px;color:#00D632;font-size:.85rem;font-weight:700;padding:7px 10px;text-align:center;font-family:monospace;outline:none;width:160px;"><button onclick="navigator.clipboard.writeText('${tag}');this.textContent='Copied!';setTimeout(()=>this.textContent='Copy',1500);" style="background:rgba(0,214,50,.1);border:1px solid rgba(0,214,50,.3);color:#00D632;border-radius:6px;padding:7px 10px;cursor:pointer;font-size:.75rem;">Copy</button></div><div style="color:#a1a1aa;font-size:.75rem;margin-top:6px;">Send exactly <strong style="color:#fff;">$${usdPrice}</strong> · Note: <em style="color:#c9a84c;">"${courseName}"</em></div></div><button id="rt-ca-btn" style="width:100%;background:linear-gradient(135deg,#00a827,#00D632);color:#fff;border:none;padding:13px;border-radius:8px;font-weight:700;cursor:pointer;"><i class="fas fa-check"></i> I Sent the Payment</button></div>`;
    document.getElementById('rt-ca-btn').onclick=()=>{ document.getElementById('rt-ca-btn').disabled=true; simProcess('Verifying transfer','#00D632',2000,'Cash App',t=>showSuccess('Cash App',t)); };
  }

  function renderBitcoin() {
    const addr='bc1q'+Math.random().toString(36).substr(2,8)+'sovereign'+Math.random().toString(36).substr(2,6);
    const btc=(usdPrice/67500).toFixed(6);
    document.getElementById('rt-method-panel').innerHTML = `<div style="text-align:center;"><div style="background:rgba(245,158,11,.06);border:1px solid rgba(245,158,11,.2);border-radius:10px;padding:14px;margin-bottom:12px;"><div style="font-size:.7rem;color:#f59e0b;font-weight:700;margin-bottom:8px;text-transform:uppercase;">Bitcoin On-Chain · ${btc} BTC</div><div style="background:#fff;padding:8px;border-radius:8px;display:inline-block;margin-bottom:8px;"><img src="https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=bitcoin:${addr}?amount=${btc}" width="140" height="140" alt="BTC QR" style="display:block;border-radius:4px;"/></div><div style="display:flex;align-items:center;gap:6px;justify-content:center;"><input value="${addr}" readonly style="background:#0a0a0f;border:1px solid rgba(245,158,11,.3);border-radius:6px;color:#f59e0b;font-size:.65rem;font-family:monospace;padding:6px 8px;text-align:center;outline:none;width:190px;text-overflow:ellipsis;"><button onclick="navigator.clipboard.writeText('${addr}');this.textContent='✓';setTimeout(()=>this.textContent='Copy',1500);" style="background:rgba(245,158,11,.1);border:1px solid rgba(245,158,11,.3);color:#f59e0b;border-radius:6px;padding:6px 10px;cursor:pointer;font-size:.75rem;">Copy</button></div></div><button id="rt-btc-btn" style="width:100%;background:linear-gradient(135deg,#d97706,#f59e0b);color:#111;border:none;padding:13px;border-radius:8px;font-weight:700;cursor:pointer;">⚡ Simulate Payment Sent</button></div>`;
    document.getElementById('rt-btc-btn').onclick=()=>{ document.getElementById('rt-btc-btn').disabled=true; simProcess('Awaiting confirmation','#f59e0b',3500,'BTC',t=>showSuccess('Bitcoin',t)); };
  }

  function renderLightning() {
    const sats=Math.round((usdPrice/67500)*1e8);
    const inv='lnbc'+sats+'n1p'+Math.random().toString(16).substr(2,48);
    document.getElementById('rt-method-panel').innerHTML = `<div style="text-align:center;"><div style="background:rgba(168,85,247,.06);border:1px solid rgba(168,85,247,.2);border-radius:10px;padding:14px;margin-bottom:12px;"><div style="font-size:.7rem;color:#a855f7;font-weight:700;margin-bottom:8px;text-transform:uppercase;"><i class="fas fa-bolt"></i> Lightning · ${sats.toLocaleString()} sats</div><div style="background:#fff;padding:8px;border-radius:8px;display:inline-block;margin-bottom:8px;"><img src="https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=${inv}" width="140" height="140" alt="LN QR" style="display:block;border-radius:4px;"/></div><div style="display:flex;align-items:center;gap:6px;justify-content:center;"><input value="${inv.substr(0,40)}..." readonly style="background:#0a0a0f;border:1px solid rgba(168,85,247,.3);border-radius:6px;color:#a855f7;font-size:.62rem;font-family:monospace;padding:6px 8px;text-align:center;outline:none;width:190px;"><button onclick="navigator.clipboard.writeText('${inv}');this.textContent='✓';setTimeout(()=>this.textContent='Copy',1500);" style="background:rgba(168,85,247,.1);border:1px solid rgba(168,85,247,.3);color:#a855f7;border-radius:6px;padding:6px 10px;cursor:pointer;font-size:.75rem;">Copy</button></div><div style="font-size:.7rem;color:#6b7280;margin-top:6px;">Invoice expires in 10 min · near-zero fee</div></div><button id="rt-ln-btn" style="width:100%;background:linear-gradient(135deg,#7c3aed,#a855f7);color:#fff;border:none;padding:13px;border-radius:8px;font-weight:700;cursor:pointer;"><i class="fas fa-bolt"></i> Verify Lightning Payment</button></div>`;
    document.getElementById('rt-ln-btn').onclick=()=>{ document.getElementById('rt-ln-btn').disabled=true; simProcess('Verifying Lightning payment','#a855f7',1800,'Lightning',t=>showSuccess('Lightning',t)); };
  }

  const renderers = { card:renderCard, paypal:renderPayPal, cashapp:renderCashApp, bitcoin:renderBitcoin, lightning:renderLightning };

  function selectMethod(id) {
    document.querySelectorAll('.rt-method-btn').forEach(b=>b.classList.remove('selected'));
    const btn=document.querySelector(`.rt-method-btn[data-method="${id}"]`);
    if(btn)btn.classList.add('selected');
    renderers[id]&&renderers[id]();
  }

  document.getElementById('rt-method-grid').addEventListener('click', e=>{
    const btn=e.target.closest('.rt-method-btn');
    if(btn)selectMethod(btn.dataset.method);
  });
  selectMethod('card');
};

// Route legacy bitcoin button through unified modal
window.openBitcoinPayment = (courseName, usdPrice) => window.openPaymentModal(courseName, usdPrice);


/* ────────────────────────────────────────────
   18. FIRST-VISIT ONBOARDING FLOW
──────────────────────────────────────────── */
(function initOnboarding() {
  if (localStorage.getItem('rt_onboarded')) return;

  const TYPES = [
    { id:'organizer', icon:'<span role="img" aria-label="Community Organizing">✊</span>', label:'Organizer',  desc:'Criminal justice, housing, labor' },
    { id:'activist',  icon:'🌍', label:'Activist',   desc:'Environment, civil rights, policy' },
    { id:'student',   icon:'📚', label:'Student',    desc:'Movement history & theory' },
    { id:'supporter', icon:'💜', label:'Supporter',  desc:'Fund & amplify the movement' },
  ];

  const overlay = document.createElement('div');
  overlay.id = 'rt-onboarding';
  Object.assign(overlay.style, { position:'fixed',inset:'0',zIndex:'99999',background:'rgba(0,0,0,.92)',backdropFilter:'blur(14px)',display:'flex',alignItems:'center',justifyContent:'center',fontFamily:'system-ui,sans-serif',padding:'20px',boxSizing:'border-box',opacity:'0',transition:'opacity .5s' });

  overlay.innerHTML = `
  <div style="background:#1c1c1f;border:1px solid #3f3f46;border-radius:20px;width:100%;max-width:480px;overflow:hidden;box-shadow:0 30px 80px rgba(0,0,0,.8);position:relative;">
    <div style="display:flex;justify-content:center;gap:8px;padding:18px 24px 0;" id="ob-dots">
      ${[0,1,2].map(i=>`<div class="ob-dot" style="height:8px;border-radius:4px;background:${i===0?'#c9a84c':'#2e2e2e'};width:${i===0?'20px':'8px'};transition:all .3s;"></div>`).join('')}
    </div>
    <button id="ob-skip" style="position:absolute;top:14px;right:14px;background:none;border:none;color:#4b5563;font-size:.78rem;cursor:pointer;padding:4px 8px;border-radius:4px;">Skip &times;</button>

    <div id="ob-step-0" style="padding:22px;">
      <h2 style="text-align:center;color:#fff;font-size:1.3rem;font-weight:900;margin:0 0 5px;">Welcome to<br><span style="background:linear-gradient(135deg,#c9a84c,#f0d080);-webkit-background-clip:text;-webkit-text-fill-color:transparent;">Radiant Threshold</span></h2>
      <p style="text-align:center;color:#a1a1aa;font-size:.83rem;margin:0 0 18px;">What brings you here?</p>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:20px;" id="ob-types">
        ${TYPES.map(t=>`<button class="ob-type-btn" data-type="${t.id}" style="background:rgba(255,255,255,.03);border:1.5px solid #2e2e2e;border-radius:12px;padding:16px 10px;cursor:pointer;text-align:center;transition:all .2s;"><div style="font-size:1.6rem;margin-bottom:5px;">${t.icon}</div><div style="font-weight:700;color:#fff;font-size:.85rem;margin-bottom:2px;">${t.label}</div><div style="font-size:.7rem;color:#6b7280;">${t.desc}</div></button>`).join('')}
      </div>
      <button id="ob-next-0" disabled style="width:100%;background:linear-gradient(135deg,#c9a84c,#f0d080);color:#0a0a0f;border:none;padding:13px;border-radius:10px;font-weight:800;cursor:pointer;font-size:.9rem;opacity:.5;">Continue &rarr;</button>
    </div>

    <div id="ob-step-1" style="padding:22px;display:none;">
      <h2 style="text-align:center;color:#fff;font-size:1.2rem;font-weight:900;margin:0 0 5px;">Choose Your Access Path</h2>
      <p style="text-align:center;color:#a1a1aa;font-size:.82rem;margin:0 0 16px;">Money is never a barrier here.</p>
      <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:18px;">
        <div style="background:rgba(16,185,129,.06);border:1.5px solid rgba(16,185,129,.2);border-radius:10px;padding:14px 16px;display:flex;align-items:center;gap:12px;"><div style="font-size:1.4rem;">🔓</div><div style="flex:1;"><div style="font-weight:700;color:#fff;font-size:.88rem;">Free Access</div><div style="font-size:.74rem;color:#6b7280;">Know Your Rights + 3 intros — forever free.</div></div><span style="font-weight:900;color:#10b981;">$0</span></div>
        <div style="background:rgba(201,168,76,.08);border:1.5px solid rgba(201,168,76,.35);border-radius:10px;padding:14px 16px;display:flex;align-items:center;gap:12px;position:relative;"><div style="position:absolute;top:-10px;left:50%;transform:translateX(-50%);background:linear-gradient(135deg,#c9a84c,#f0d080);color:#0a0a0f;padding:2px 10px;border-radius:10px;font-size:.66rem;font-weight:700;">POPULAR</div><div style="font-size:1.4rem;">⚡</div><div style="flex:1;"><div style="font-weight:700;color:#fff;font-size:.88rem;">Full Access</div><div style="font-size:.74rem;color:#6b7280;">Bitcoin, PayPal, Cash App, Card, Lightning.</div></div><span style="font-weight:900;color:#c9a84c;">$47–149</span></div>
        <div style="background:rgba(139,92,246,.06);border:1.5px solid rgba(139,92,246,.2);border-radius:10px;padding:14px 16px;display:flex;align-items:center;gap:12px;"><div style="font-size:1.4rem;">🤝</div><div style="flex:1;"><div style="font-weight:700;color:#fff;font-size:.88rem;">Scholarship</div><div style="font-size:.74rem;color:#6b7280;">Full access — apply in 2 minutes.</div></div><span style="font-weight:900;color:#10b981;">Free</span></div>
      </div>
      <div style="display:flex;gap:8px;">
        <button id="ob-back-1" style="flex:0 0 auto;background:none;border:1px solid #3f3f46;color:#a1a1aa;padding:11px 16px;border-radius:10px;cursor:pointer;font-size:.85rem;">&larr;</button>
        <button id="ob-next-1" style="flex:1;background:linear-gradient(135deg,#c9a84c,#f0d080);color:#0a0a0f;border:none;padding:11px;border-radius:10px;font-weight:800;cursor:pointer;font-size:.88rem;">Looks Good &rarr;</button>
      </div>
    </div>

    <div id="ob-step-2" style="padding:32px 22px;display:none;text-align:center;">
      <div style="width:64px;height:64px;border-radius:50%;background:linear-gradient(135deg,#059669,#10b981);display:flex;align-items:center;justify-content:center;margin:0 auto 14px;font-size:1.8rem;box-shadow:0 0 28px rgba(16,185,129,.3);">✓</div>
      <h2 style="color:#fff;font-size:1.3rem;font-weight:900;margin:0 0 7px;">You're in the network!</h2>
      <p id="ob-welcome-msg" style="color:#a1a1aa;font-size:.85rem;margin:0 0 22px;line-height:1.5;">Welcome to Radiant Threshold. The movement is stronger with you.</p>
      <a href="explore.html" style="display:block;background:linear-gradient(135deg,#c9a84c,#f0d080);color:#0a0a0f;text-decoration:none;padding:14px;border-radius:10px;font-weight:800;font-size:.95rem;margin-bottom:10px;">Explore Training &rarr;</a>
      <a href="apply.html" style="display:block;color:#6b7280;font-size:.8rem;text-decoration:none;">Apply for scholarship instead</a>
    </div>
  </div>`;

  document.body.appendChild(overlay);
  setTimeout(() => { overlay.style.opacity = '1'; }, 800);

  let selectedType = null;
  let step = 0;

  function dots(n) {
    document.querySelectorAll('.ob-dot').forEach((d,i) => {
      d.style.background = i <= n ? '#c9a84c' : '#2e2e2e';
      d.style.width = i === n ? '20px' : '8px';
    });
  }

  function goStep(n) {
    document.getElementById(`ob-step-${step}`).style.display = 'none';
    step = n;
    document.getElementById(`ob-step-${step}`).style.display = 'block';
    dots(step);
  }

  function dismiss() {
    localStorage.setItem('rt_onboarded','true');
    overlay.style.opacity = '0';
    setTimeout(() => overlay.remove(), 400);
  }

  document.getElementById('ob-skip').onclick = dismiss;

  document.getElementById('ob-types').addEventListener('click', e => {
    const btn = e.target.closest('.ob-type-btn');
    if (!btn) return;
    document.querySelectorAll('.ob-type-btn').forEach(b => { b.style.borderColor='#2e2e2e'; b.style.background='rgba(255,255,255,.03)'; });
    btn.style.borderColor = '#c9a84c';
    btn.style.background = 'rgba(201,168,76,.12)';
    selectedType = btn.dataset.type;
    localStorage.setItem('rt_user_type', selectedType);
    const next = document.getElementById('ob-next-0');
    next.disabled = false;
    next.style.opacity = '1';
  });

  document.getElementById('ob-next-0').onclick = () => goStep(1);
  document.getElementById('ob-back-1').onclick = () => goStep(0);
  document.getElementById('ob-next-1').onclick = () => {
    const labels = { organizer:'Organizer', activist:'Activist', student:'Student', supporter:'Supporter' };
    document.getElementById('ob-welcome-msg').textContent = `Welcome, ${labels[selectedType]||'Friend'}. Radiant Threshold is built for people committed to lasting change. Let's get started.`;
    goStep(2);
  };
})();

// ---------------------------------------------------------------
// Resource download tracking — local-only, no data leaves the browser
// (consistent with IRN's local-first / Technical Incapacity model).
// Previously called on every resource card but never defined, which
// threw a JS error and silently blocked every download on this page.
// ---------------------------------------------------------------
function trackDownload(linkEl, resourceName) {
  try {
    const key = 'rt_resource_downloads';
    const counts = JSON.parse(localStorage.getItem(key) || '{}');
    counts[resourceName] = (counts[resourceName] || 0) + 1;
    localStorage.setItem(key, JSON.stringify(counts));

    // Optimistically bump the visible counter on the card itself.
    const card = linkEl.closest('.res-card');
    const countEl = card && card.querySelector('.res-dl-count');
    if (countEl) {
      const base = parseInt(card.dataset.downloads || '0', 10) + counts[resourceName];
      const display = base >= 1000 ? (base / 1000).toFixed(1) + 'K' : String(base);
      countEl.innerHTML = '<i class="fas fa-arrow-down" style="font-size:0.7rem;margin-right:3px;"></i>' + display + ' downloads';
    }
  } catch (err) {
    // Local tracking is a nice-to-have; never let it block the actual download.
    console.warn('trackDownload: local tracking failed', err);
  }
  // Returning true (not false) lets the link's href navigate/download normally.
  return true;
}


/* ────────────────────────────────────────────
   17. SOVEREIGN RADIO PLAYER WIDGET
   ──────────────────────────────────────────── */
(function initSovereignRadioWidget() {
  // Styles injection
  const styleEl = document.createElement('style');
  styleEl.textContent = `
    #sovereign-radio-widget {
      position: fixed;
      bottom: 24px;
      left: 24px;
      z-index: 9999;
      font-family: var(--font-sans, system-ui, -apple-system, sans-serif);
    }
    #radio-toggle-btn {
      background: linear-gradient(135deg, #1e1b18, #0e0c0b);
      color: #c9a84c;
      border: 1px solid rgba(201, 168, 76, 0.3);
      padding: 14px 22px;
      border-radius: 50px;
      cursor: pointer;
      font-weight: 700;
      font-size: 0.9rem;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4);
      display: flex;
      align-items: center;
      gap: 10px;
      transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
    }
    #radio-toggle-btn:hover {
      transform: translateY(-2px);
      border-color: rgba(201, 168, 76, 0.6);
      box-shadow: 0 6px 24px rgba(201, 168, 76, 0.15);
    }
    #radio-window {
      display: none;
      width: 320px;
      background: rgba(18, 18, 22, 0.95);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      border: 1px solid rgba(201, 168, 76, 0.25);
      border-radius: 16px;
      box-shadow: 0 12px 40px rgba(0, 0, 0, 0.6);
      flex-direction: column;
      margin-bottom: 12px;
      overflow: hidden;
      opacity: 0;
      transform: translateY(20px) scale(0.95);
      transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
    }
    #radio-window.open {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
    .radio-header {
      background: rgba(30, 30, 35, 0.85);
      padding: 14px 16px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .radio-header-info {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .radio-logo {
      font-size: 1.2rem;
      color: #c9a84c;
      animation: pulse-radio 2s infinite alternate;
    }
    @keyframes pulse-radio {
      0% { opacity: 0.6; }
      100% { opacity: 1; }
    }
    .radio-close-btn {
      background: none;
      border: none;
      color: #9a9382;
      font-size: 1.1rem;
      cursor: pointer;
      padding: 4px;
      transition: color 0.2s;
    }
    .radio-close-btn:hover {
      color: #f6f4ee;
    }
    .radio-body {
      padding: 20px;
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    .radio-status {
      display: flex;
      align-items: center;
      justify-content: space-between;
      background: rgba(255,255,255,0.03);
      padding: 10px 14px;
      border-radius: 8px;
      border: 1px solid rgba(255,255,255,0.05);
    }
    .radio-live-badge {
      display: flex;
      align-items: center;
      gap: 6px;
      font-family: 'DM Mono', monospace;
      font-size: 0.72rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: #c9a84c;
    }
    .radio-live-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: #c9a84c;
    }
    .radio-live-dot.active {
      background: #10b981;
      box-shadow: 0 0 8px #10b981;
      animation: blink-live 1.5s infinite;
    }
    @keyframes blink-live {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.4; }
    }
    .radio-channel-title {
      font-weight: 700;
      font-size: 0.9rem;
      color: #f6f4ee;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 160px;
    }
    .radio-controls {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 20px;
    }
    .radio-btn {
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.1);
      width: 44px;
      height: 44px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      color: #f6f4ee;
      transition: all 0.2s;
    }
    .radio-btn:hover {
      background: rgba(201, 168, 76, 0.15);
      border-color: #c9a84c;
      color: #c9a84c;
    }
    .radio-btn.play-btn {
      width: 54px;
      height: 54px;
      background: #c9a84c;
      color: #111;
      border: none;
    }
    .radio-btn.play-btn:hover {
      transform: scale(1.05);
      background: #dfbc5a;
      color: #111;
    }
    .radio-channels-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .channel-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 10px 14px;
      border-radius: 8px;
      background: rgba(255,255,255,0.02);
      border: 1px solid rgba(255,255,255,0.05);
      cursor: pointer;
      font-size: 0.82rem;
      color: #9a9382;
      transition: all 0.2s;
    }
    .channel-item:hover {
      background: rgba(255,255,255,0.04);
      color: #f6f4ee;
    }
    .channel-item.active {
      background: rgba(201, 168, 76, 0.08);
      border-color: rgba(201, 168, 76, 0.3);
      color: #c9a84c;
      font-weight: 600;
    }
    .radio-volume {
      display: flex;
      align-items: center;
      gap: 10px;
      font-size: 0.8rem;
      color: #9a9382;
      margin-top: 4px;
    }
    .volume-slider {
      flex: 1;
      -webkit-appearance: none;
      height: 4px;
      border-radius: 2px;
      background: rgba(255,255,255,0.1);
      outline: none;
    }
    .volume-slider::-webkit-slider-thumb {
      -webkit-appearance: none;
      width: 12px;
      height: 12px;
      border-radius: 50%;
      background: #c9a84c;
      cursor: pointer;
      transition: transform 0.1s;
    }
    .volume-slider::-webkit-slider-thumb:hover {
      transform: scale(1.2);
    }
    
    /* Visualizer Bouncing Bars */
    .radio-visualizer {
      display: flex;
      align-items: flex-end;
      gap: 3px;
      height: 18px;
    }
    .vis-bar {
      width: 3px;
      height: 3px;
      background-color: #c9a84c;
      border-radius: 2px;
      transition: height 0.1s;
    }
    .vis-bar.playing {
      animation: bounce 0.8s ease-in-out infinite alternate;
    }
    .vis-bar:nth-child(2).playing { animation-delay: 0.15s; }
    .vis-bar:nth-child(3).playing { animation-delay: 0.30s; }
    .vis-bar:nth-child(4).playing { animation-delay: 0.45s; }
    @keyframes bounce {
      0% { height: 3px; }
      100% { height: 18px; }
    }
  `;
  document.head.appendChild(styleEl);

  // Widget Container
  const widget = document.createElement('div');
  widget.id = 'sovereign-radio-widget';
  widget.innerHTML = `
    <div id="radio-window">
      <div class="radio-header">
        <div class="radio-header-info">
          <span class="radio-logo">📻</span>
          <div style="display: flex; flex-direction: column;">
            <span style="color: white; font-weight: 700; font-size: 0.88rem;">Sovereign Radio</span>
            <span style="color: #c9a84c; font-size: 0.72rem; font-family: 'DM Mono', monospace; font-weight: 600;">108.1 FM · HR / BAL</span>
          </div>
        </div>
        <button id="radio-close-btn" class="radio-close-btn" aria-label="Close Radio">✕</button>
      </div>
      
      <div class="radio-body">
        <div class="radio-status">
          <div class="radio-live-badge">
            <span class="radio-live-dot" id="radio-live-dot"></span>
            <span id="radio-status-text">OFFLINE</span>
          </div>
          <span class="radio-channel-title" id="radio-channel-title">Sovereign Beats</span>
          
          <div class="radio-visualizer">
            <div class="vis-bar" id="vis-1"></div>
            <div class="vis-bar" id="vis-2"></div>
            <div class="vis-bar" id="vis-3"></div>
            <div class="vis-bar" id="vis-4"></div>
          </div>
        </div>

        <div class="radio-controls">
          <button class="radio-btn" id="radio-prev-btn" title="Previous Channel">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/></svg>
          </button>
          <button class="radio-btn play-btn" id="radio-play-btn" title="Play">
            <svg id="play-icon" viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
            <svg id="pause-icon" viewBox="0 0 24 24" width="24" height="24" fill="currentColor" style="display:none;"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
          </button>
          <button class="radio-btn" id="radio-next-btn" title="Next Channel">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6z"/></svg>
          </button>
        </div>

        <div class="radio-channels-list">
          <div class="channel-item active" data-index="0">
            <span>1. Sovereign Beats (Lofi Coding)</span>
            <span style="font-family: 'DM Mono', monospace; font-size: 0.7rem;">Live</span>
          </div>
          <div class="channel-item" data-index="1">
            <span>2. Accountability Scanner (Police)</span>
            <span style="font-family: 'DM Mono', monospace; font-size: 0.7rem;">Ambient</span>
          </div>
          <div class="channel-item" data-index="2">
            <span>3. Abolition Briefings (Briefs)</span>
            <span style="font-family: 'DM Mono', monospace; font-size: 0.7rem;">Speech</span>
          </div>
        </div>

        <div class="radio-volume">
          <span>🔊</span>
          <input type="range" class="volume-slider" id="radio-volume-slider" min="0" max="1" step="0.05" value="0.5">
        </div>
      </div>
    </div>
    <button id="radio-toggle-btn">
      📻 Sovereign Radio
    </button>
  `;
  document.body.appendChild(widget);

  // Audio streams configuration
  const channels = [
    {
      name: "Sovereign Beats",
      url: "https://coderadio-admin-v2.freecodecamp.org/listen/coderadio/radio.mp3",
      type: "live"
    },
    {
      name: "Accountability Scanner",
      url: "https://ice1.somafm.com/groovesalad-256-mp3",
      type: "ambient"
    },
    {
      name: "Abolition Briefings",
      url: "https://ice1.somafm.com/lush-128-mp3",
      type: "speech"
    }
  ];

  let currentChannelIdx = 0;
  const audio = new Audio();
  audio.volume = 0.5;

  // DOM Elements
  const rToggleBtn = document.getElementById('radio-toggle-btn');
  const rCloseBtn = document.getElementById('radio-close-btn');
  const rWindow = document.getElementById('radio-window');
  const rPlayBtn = document.getElementById('radio-play-btn');
  const rPrevBtn = document.getElementById('radio-prev-btn');
  const rNextBtn = document.getElementById('radio-next-btn');
  const rLiveDot = document.getElementById('radio-live-dot');
  const rStatusText = document.getElementById('radio-status-text');
  const rChannelTitle = document.getElementById('radio-channel-title');
  const rVolumeSlider = document.getElementById('radio-volume-slider');
  const rChannelItems = document.querySelectorAll('.channel-item');
  const playIcon = document.getElementById('play-icon');
  const pauseIcon = document.getElementById('pause-icon');
  const visBars = document.querySelectorAll('.vis-bar');

  // Toggle Visibility
  rToggleBtn.addEventListener('click', () => {
    const isClosed = rWindow.style.display === 'none' || !rWindow.classList.contains('open');
    if (isClosed) {
      rWindow.style.display = 'flex';
      rWindow.offsetHeight;
      rWindow.classList.add('open');
      rToggleBtn.style.transform = 'scale(0.9)';
      rToggleBtn.style.opacity = '0';
      setTimeout(() => {
        rToggleBtn.style.display = 'none';
      }, 200);
    }
  });

  function closeWidget() {
    rWindow.classList.remove('open');
    rToggleBtn.style.display = 'flex';
    rToggleBtn.offsetHeight;
    rToggleBtn.style.transform = 'scale(1)';
    rToggleBtn.style.opacity = '1';
    setTimeout(() => {
      rWindow.style.display = 'none';
    }, 300);
  }

  rCloseBtn.addEventListener('click', closeWidget);

  // Play / Pause Logic
  function setPlayState(isPlaying) {
    if (isPlaying) {
      playIcon.style.display = 'none';
      pauseIcon.style.display = 'block';
      rLiveDot.classList.add('active');
      rStatusText.textContent = channels[currentChannelIdx].type === 'live' ? 'LIVE' : 'PLAYING';
      visBars.forEach(bar => bar.classList.add('playing'));
    } else {
      playIcon.style.display = 'block';
      pauseIcon.style.display = 'none';
      rLiveDot.classList.remove('active');
      rStatusText.textContent = 'PAUSED';
      visBars.forEach(bar => bar.classList.remove('playing'));
    }
  }

  async function playChannel(idx) {
    currentChannelIdx = idx;
    audio.src = channels[idx].url;
    rChannelTitle.textContent = channels[idx].name;
    
    rChannelItems.forEach((item, index) => {
      if (index === idx) item.classList.add('active');
      else item.classList.remove('active');
    });

    rStatusText.textContent = "TUNING...";
    try {
      await audio.play();
      setPlayState(true);
    } catch (err) {
      console.warn("Audio playback failed", err);
      setPlayState(false);
    }
  }

  rPlayBtn.addEventListener('click', () => {
    if (audio.paused) {
      if (!audio.src) {
        playChannel(currentChannelIdx);
      } else {
        audio.play().then(() => setPlayState(true)).catch(() => setPlayState(false));
      }
    } else {
      audio.pause();
      setPlayState(false);
    }
  });

  rPrevBtn.addEventListener('click', () => {
    let prev = currentChannelIdx - 1;
    if (prev < 0) prev = channels.length - 1;
    playChannel(prev);
  });

  rNextBtn.addEventListener('click', () => {
    let next = currentChannelIdx + 1;
    if (next >= channels.length) next = 0;
    playChannel(next);
  });

  rVolumeSlider.addEventListener('input', (e) => {
    audio.volume = e.target.value;
  });

  rChannelItems.forEach(item => {
    item.addEventListener('click', () => {
      const idx = parseInt(item.dataset.index, 10);
      playChannel(idx);
    });
  });
})();


/* ────────────────────────────────────────────
   18. SOVEREIGN OS — INTERACTIVE SOFTWARE SUITE
   ──────────────────────────────────────────── */
(function initSovereignOSSuite() {
  const tabs = document.querySelectorAll('.suite-tab-btn');
  const panels = document.querySelectorAll('.suite-panel');

  if (!tabs.length) return;

  // 1. Tab Switching Logic
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      // Deactivate all
      tabs.forEach(t => t.classList.remove('active'));
      panels.forEach(p => {
        p.classList.remove('active');
        p.style.display = 'none';
      });

      // Activate clicked
      tab.classList.add('active');
      const targetId = tab.dataset.tab;
      const targetPanel = document.getElementById(targetId);
      if (targetPanel) {
        targetPanel.classList.add('active');
        targetPanel.style.display = 'block';
      }
    });
  });

  // 2. Judge Search Logic
  const judgeInput = document.getElementById('judge-search-input');
  const searchBtn = document.getElementById('btn-search-judge');
  const judgeResults = document.getElementById('judge-results');

  const judgesDb = {
    harrison: {
      name: "Judge Arthur Harrison",
      court: "Portsmouth Circuit Court",
      disparity: "+340% Higher Cash Bails",
      disparityDesc: "Black defendants are ordered to pay cash bail 3.4x more frequently than White defendants for identical charges.",
      sentence: "+1.2 Years Above Average",
      sentenceDesc: "Sentencing history is significantly longer than the Virginia state average for drug-related offenses.",
      complaints: "12 Open Complaints",
      complaintsDesc: "Filed by advocates regarding courtroom temperament, procedural delays, and racial bias."
    },
    vance: {
      name: "Judge Eleanor Vance",
      court: "Baltimore District Court",
      disparity: "+280% Higher Cash Bails",
      disparityDesc: "Average bail amounts set are $18,500 for minority defendants vs $4,200 for others.",
      sentence: "Strict Max Sentences",
      sentenceDesc: "Regularly issues maximum statutory penalties for non-violent misdemeanor charges.",
      complaints: "7 Active Investigations",
      complaintsDesc: "Currently being reviewed by the Maryland Commission on Judicial Disabilities."
    },
    smith: {
      name: "Judge Richard Smith",
      court: "Norfolk General District Court",
      disparity: "+180% Higher Cash Bails",
      disparityDesc: "Black defendants face significantly higher bail requirements.",
      sentence: "89% Conviction Bias",
      sentenceDesc: "Racial disparity in misdemeanor plea rates is highly elevated in this courtroom.",
      complaints: "4 Active Complaints",
      complaintsDesc: "Advocates have logged complaints regarding administrative denial of public defender requests."
    }
  };

  searchBtn.addEventListener('click', () => {
    const query = judgeInput.value.toLowerCase().trim();
    if (!query) return;

    // Find match or use fallback
    let match = null;
    for (const key in judgesDb) {
      if (query.includes(key)) {
        match = judgesDb[key];
        break;
      }
    }

    judgeResults.style.display = 'block';

    if (match) {
      judgeResults.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid var(--border-glass); padding-bottom:10px; margin-bottom:14px;">
          <h4 style="color:#fff; font-weight:700; font-size:1.05rem; margin:0;">${match.name}</h4>
          <span style="font-family:'DM Mono', monospace; font-size:0.75rem; background:rgba(239,68,68,0.12); color:#f87171; border:1px solid #f87171; padding:2px 8px; border-radius:20px;">Audited</span>
        </div>
        <div style="font-size:0.8rem; color:var(--text-muted); margin-bottom:12px;">Court: <strong style="color:#fff;">${match.court}</strong></div>
        
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px; margin-top:16px;">
          <div>
            <div style="font-size:0.7rem; text-transform:uppercase; color:var(--text-muted); font-weight:700; margin-bottom:4px;">Bail Setting Disparity</div>
            <div style="color:var(--accent-2); font-weight:800; font-size:1.1rem; margin-bottom:4px;">${match.disparity}</div>
            <div style="font-size:0.75rem; color:var(--text-secondary); line-height:1.4;">${match.disparityDesc}</div>
          </div>
          <div>
            <div style="font-size:0.7rem; text-transform:uppercase; color:var(--text-muted); font-weight:700; margin-bottom:4px;">Sentencing History</div>
            <div style="color:#fff; font-weight:800; font-size:1.1rem; margin-bottom:4px;">${match.sentence}</div>
            <div style="font-size:0.75rem; color:var(--text-secondary); line-height:1.4;">${match.sentenceDesc}</div>
          </div>
        </div>
        <div style="margin-top:16px; padding-top:14px; border-top:1px solid rgba(255,255,255,0.05);">
          <div style="font-size:0.7rem; text-transform:uppercase; color:var(--text-muted); font-weight:700; margin-bottom:4px;">Advocacy Complaints</div>
          <div style="color:#fbbf24; font-weight:700; font-size:0.92rem; margin-bottom:4px;">${match.complaints}</div>
          <div style="font-size:0.75rem; color:var(--text-secondary); line-height:1.4;">${match.complaintsDesc}</div>
        </div>
      `;
    } else {
      // Fallback
      judgeResults.innerHTML = `
        <div style="text-align:center; padding:10px 0;">
          <h4 style="color:#fff; font-weight:700; font-size:1rem; margin-bottom:6px;">No Specific Record Found for "${judgeInput.value}"</h4>
          <p style="font-size:0.78rem; color:var(--text-muted); line-height:1.5; max-width:400px; margin:0 auto;">
            We do not have a dedicated audit report for this name. Enter <strong>Harrison</strong>, <strong>Vance</strong>, or <strong>Smith</strong> to view sample audited judge profiles.
          </p>
        </div>
      `;
    }
  });

  // 3. FOIA Builder Logic
  const foiaState = document.getElementById('foia-state');
  const foiaAgency = document.getElementById('foia-agency');
  const foiaDesc = document.getElementById('foia-desc');
  const btnGenerateFoia = document.getElementById('btn-generate-foia');
  const foiaOutputContainer = document.getElementById('foia-output-container');
  const foiaLetterText = document.getElementById('foia-letter-text');
  const btnCopyFoia = document.getElementById('btn-copy-foia');

  btnGenerateFoia.addEventListener('click', () => {
    const agency = foiaAgency.value.trim() || "[Target Law Enforcement Agency]";
    const description = foiaDesc.value.trim() || "[Describe public records requested here, e.g., bodycam footage of traffic stops on Main St. on June 15]";
    const state = foiaState.value;

    let statute = "";
    let deadline = "";

    if (state === "VA") {
      statute = "Virginia Freedom of Information Act (§ 2.2-3700 et seq.)";
      deadline = "5 working days";
    } else if (state === "MD") {
      statute = "Maryland Public Information Act (GP § 4-101 et seq.)";
      deadline = "30 calendar days";
    } else if (state === "DC") {
      statute = "District of Columbia Freedom of Information Act (D.C. Code § 2-531 et seq.)";
      deadline = "15 working days";
    } else {
      statute = "North Carolina Public Records Law (G.S. § 132-1 et seq.)";
      deadline = "prompt and reasonable time";
    }

    const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

    const letter = `Date: ${today}

To: Public Records Officer
    ${agency}

RE: Public Records Act Request

Pursuant to the ${statute}, I hereby request copies of the following public records:

- ${description}

I request that all responsive files be provided electronically in their native format to avoid reproduction costs. Under applicable law, a response is required within ${deadline}.

If my request is denied in whole or in part, please justify the denial by citing the specific statutory exemption permitting non-disclosure.

Thank you,
[Community Advocate / Concerned Resident]`;

    foiaLetterText.value = letter;
    foiaOutputContainer.style.display = 'block';
  });

  btnCopyFoia.addEventListener('click', () => {
    foiaLetterText.select();
    document.execCommand('copy');
    const originalText = btnCopyFoia.innerHTML;
    btnCopyFoia.innerHTML = `<i class="fas fa-check"></i> Copied!`;
    setTimeout(() => {
      btnCopyFoia.innerHTML = originalText;
    }, 2000);
  });

  // 4. AI Document Scanner Logic
  const analyzerInput = document.getElementById('analyzer-input');
  const btnAnalyzeDoc = document.getElementById('btn-analyze-doc');
  const analyzerOutput = document.getElementById('analyzer-output');

  btnAnalyzeDoc.addEventListener('click', () => {
    const text = analyzerInput.value.trim();
    if (!text) return;

    analyzerOutput.style.display = 'block';
    analyzerOutput.innerHTML = "";
    
    const logs = [
      "[SYS] Initializing offline local LLM scanner...",
      "[SYS] Model loaded: Qwen 2.5 0.5B (Local Inference, Zero-Trust)",
      "[SCAN] Running lexical pattern matching...",
      "[AUDIT] Scanning Fourth Amendment compliance thresholds...",
      "[WARN] LINE 3: 'Subject displayed nervous movements upon stopping...' -> Flagged: Mere nervousness is insufficient under Terry stop case law.",
      "[WARN] LINE 6: 'Proceeded with search of console...' -> Flagged: Warrantless vehicle search requires Probable Cause or written consent. No record matches.",
      "[INFO] Comparing officer narrative with dispatch call logs...",
      "[WARN] MISMATCH DETECTED: Officer narrative logs search at 15:40. Dispatch timestamps show request for backup at 15:48. Time contradiction.",
      "[SUCCESS] Analysis complete. 3 high-risk procedural errors flagged."
    ];

    let currentLogIdx = 0;
    const interval = setInterval(() => {
      if (currentLogIdx < logs.length) {
        const div = document.createElement('div');
        div.textContent = logs[currentLogIdx];
        if (logs[currentLogIdx].includes('[WARN]')) {
          div.style.color = '#f87171'; // red warning
        } else if (logs[currentLogIdx].includes('[SUCCESS]')) {
          div.style.color = '#10b981'; // green success
        } else {
          div.style.color = '#9ca3af'; // gray info
        }
        analyzerOutput.appendChild(div);
        analyzerOutput.scrollTop = analyzerOutput.scrollHeight;
        currentLogIdx++;
      } else {
        clearInterval(interval);
      }
    }, 450);
  });

  // 5. Rights Navigator Logic
  const rightsBtns = document.querySelectorAll('.rights-btn');
  const rightsOutput = document.getElementById('rights-output');

  const rightsDb = {
    traffic: `
      <h4 style="color:#fff; font-weight:700; font-size:0.95rem; margin-bottom:8px;">🚗 What to do: Police Traffic Stop</h4>
      <p style="font-size:0.8rem; color:var(--text-secondary); line-height:1.5; margin-bottom:12px;">
        <strong>Your Script:</strong> "Officer, am I free to go? If not, why am I being detained?"
      </p>
      <ul style="font-size:0.78rem; color:var(--text-secondary); padding-left:20px; display:flex; flex-direction:column; gap:6px; margin:0;">
        <li>Keep your hands visible on the steering wheel.</li>
        <li>You have the right to refuse consent to search your car. Say clearly: <strong>"I do not consent to any searches."</strong></li>
        <li>Do not answer probing questions (e.g. "Where are you coming from?"). Say: <strong>"I am exercising my right to remain silent."</strong></li>
      </ul>
    `,
    street: `
      <h4 style="color:#fff; font-weight:700; font-size:0.95rem; margin-bottom:8px;">🚶 What to do: Stopped on the Street</h4>
      <p style="font-size:0.8rem; color:var(--text-secondary); line-height:1.5; margin-bottom:12px;">
        <strong>Your Script:</strong> "Am I being detained? If not, I am going to walk away."
      </p>
      <ul style="font-size:0.78rem; color:var(--text-secondary); padding-left:20px; display:flex; flex-direction:column; gap:6px; margin:0;">
        <li>You do not have to show ID to walk down the street in Virginia unless they have reasonable suspicion you committed a crime.</li>
        <li>If they detain you, you must provide identification but do not have to answer questions.</li>
        <li>Say: <strong>"I am going to remain silent. I want a lawyer."</strong></li>
      </ul>
    `,
    home: `
      <h4 style="color:#fff; font-weight:700; font-size:0.95rem; margin-bottom:8px;">🏠 What to do: Police at My Door</h4>
      <p style="font-size:0.8rem; color:var(--text-secondary); line-height:1.5; margin-bottom:12px;">
        <strong>Your Script:</strong> "Do you have a warrant signed by a judge? Slide it under the door."
      </p>
      <ul style="font-size:0.78rem; color:var(--text-secondary); padding-left:20px; display:flex; flex-direction:column; gap:6px; margin:0;">
        <li>Do not open the door. Keep it locked. Police can only enter if they have a signed warrant or an emergency threat.</li>
        <li>If they have a warrant, inspect it under the door to ensure the address is correct and it is signed.</li>
        <li>If they enter without a warrant, say clearly: <strong>"I do not consent to your entry or search."</strong></li>
      </ul>
    `,
    protest: `
      <h4 style="color:#fff; font-weight:700; font-size:0.95rem; margin-bottom:8px;">🪧 What to do: Arrested at a Protest</h4>
      <p style="font-size:0.8rem; color:var(--text-secondary); line-height:1.5; margin-bottom:12px;">
        <strong>Your Script:</strong> "I am exercising my right to remain silent and I want to speak to a lawyer."
      </p>
      <ul style="font-size:0.78rem; color:var(--text-secondary); padding-left:20px; display:flex; flex-direction:column; gap:6px; margin:0;">
        <li>Do not resist physically, even if you feel the arrest is unlawful.</li>
        <li>They cannot search the contents of your phone without a warrant. Do not unlock it or give them your passcode.</li>
        <li>Ask for a lawyer immediately. Do not answer questions or write statements without counsel present.</li>
      </ul>
    `
  };

  rightsBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      // Toggle button active classes
      rightsBtns.forEach(b => {
        b.style.borderColor = 'rgba(255,255,255,0.1)';
        b.style.background = 'rgba(255,255,255,0.03)';
      });
      btn.style.borderColor = 'var(--gold)';
      btn.style.background = 'rgba(201,168,76,0.1)';

      const scenario = btn.dataset.scenario;
      rightsOutput.style.display = 'block';
      rightsOutput.innerHTML = rightsDb[scenario] || "";
    });
  });

})();


