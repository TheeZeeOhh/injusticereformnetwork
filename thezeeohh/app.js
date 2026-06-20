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
──────────────────────────────────────────── */
(function initNewsletter() {
  const form = document.getElementById('newsletterForm');
  const success = document.getElementById('newsletterSuccess');
  if (!form) return;

  form.addEventListener('submit', function(e) {
    e.preventDefault();
    const emailInput = document.getElementById('newsletterEmail');
    const email = emailInput ? emailInput.value.trim() : '';

    if (!email || !email.includes('@')) {
      if (emailInput) {
        emailInput.style.setProperty('--input-color', 'var(--red)');
        emailInput.focus();
        emailInput.setAttribute('placeholder', 'Please enter a valid email');
        setTimeout(() => {
          emailInput.setAttribute('placeholder', 'Enter your email address');
        }, 2000);
      }
      return;
    }

    // Simulate async submission
    const submitBtn = form.querySelector('button[type="submit"]');
    if (submitBtn) {
      submitBtn.textContent = 'Subscribing…';
      submitBtn.disabled = true;
    }

    setTimeout(() => {
      form.style.display = 'none';
      if (success) success.classList.add('show');
    }, 900);
  });
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
(function initDashSidebar() {
  const navItems = document.querySelectorAll('.dash-nav-item[data-panel]');
  if (!navItems.length) return;

  navItems.forEach(item => {
    item.addEventListener('click', () => {
      navItems.forEach(i => i.classList.remove('active'));
      item.classList.add('active');
      // Could switch panels here if implemented
    });
  });
})();


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
    "rights": "If you are arrested or police detain you, assert your rights. You have the right to remain silent ('I am exercising my right to remain silent and want to speak to a lawyer'). Don't consent to searches or sign anything without an attorney. Amara Osei, J.D. (our civil rights attorney) covers this in detail in her Know Your Rights training.",
    "arrest": "If you are arrested: 1. Assert your right to remain silent ('I am exercising my right to remain silent and want to speak to a lawyer'). 2. Do not sign anything without an attorney. 3. Do not consent to search of your phone or bags. 4. Call your action's jail support line immediately.",
    "police": "When dealing with police: 1. Ask 'Am I free to go?' If yes, walk away. 2. If detained, ask 'Why am I being detained?' 3. You have the right to film them in public spaces. 4. Never lie or physically resist, but never consent to searches or answer questions without a lawyer.",
    "cop": "When dealing with police: 1. Ask 'Am I free to go?' If yes, walk away. 2. If detained, ask 'Why am I being detained?' 3. You have the right to film them in public spaces. 4. Never lie or physically resist, but never consent to searches or answer questions without a lawyer.",
    "foia": "Freedom of Information Act (FOIA) and local public records demands are essential tools. BeKura Mainoo (the Founder of IRN) is the master at this. When drafting a demand: be extremely specific about dates, names, and document types. Don't ask open-ended questions—demand specific categories of emails or budget sheets.",
    "records": "Community-controlled documentation is our shield. Don't rely on institutional archives—gather community incident logs, FOIA records, and public data. BeKura Mainoo teaches how to compile these public records demands to build leverage.",
    "policy": "A good policy proposal must be concrete, enforceable, and community-designed. If you want police accountability, demand specific budget reallocations and independent subpoena powers for civilian review boards. BeKura Mainoo is the expert here for policy design.",
    "lobbying": "Lobbying isn't just for corporate interests; it's for the people. When lobbying legislators, bring impacted community members to share testimonies, present concrete draft policies, and follow up with a clear warning: support our bill, or face organized community opposition in the next election cycle.",
    "foster": "Our foster system is heavily carceral and disproportionately tears Black and brown families apart. BeKura Mainoo and First State Advocates fight state-sponsored neglect by helping families demand records, securing legal rep, and lobbying for community family support programs.",
    "environment": "Environmental racism is a systemic reality. Dr. Keisha Morgan (environmental justice scholar) teaches how to challenge this by training frontline residents to run low-cost air monitors and map toxic outfalls, using that community science to force EPA action or file Title VI lawsuits.",
    "climate": "Climate justice means centering the frontline communities who bear the brunt of rising temperatures and extreme weather. Our campaigns focus on securing community-owned solar grids, climate resilience hubs, and stopping fossil fuel infrastructure projects locally. Dr. Keisha Morgan teaches a lot of these tactics.",
    "polluter": "When targeting corporate polluters: 1. Look up their EPA compliance records via the ECHO database. 2. Map their emissions output. 3. Build a coalition of residents, scientists, and legal teams to demand the revocation of their state operating permits. Dr. Keisha Morgan's environmental course is perfect for this.",
    "pipeline": "Pipeline struggles require a multi-faceted approach. We block construction through physical direct action, environmental impact report lawsuits, and pressuring insurance companies and banks to divest from the project. Standing Rock showed us the power of treaty-based resistance.",
    "hello": "Hey! What organizing challenge or community project are you working on today?",
    "hi": "Hey! What organizing challenge or community project are you working on today?",
    "who": "I am Amina, a digital sovereign assistant. I blend ancestral resistance frameworks with decentralized, local-first cryptography to guide communities in reclaiming autonomy, mapping power structures, and sustaining mutual aid."
  };

  // Interactive Movement Curriculum Database
  const courseCurriculum = {
    playbook: {
      title: "Course 1: The Organizer's Playbook",
      instructor: "Aziza Okoro (VP of IRN)",
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
      instructor: "Aziza Okoro (VP of IRN)",
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
      instructor: "Amara Osei, J.D. (Civil Rights Attorney)",
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
      instructor: "James Okafor (Policy Director)",
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
      instructor: "Dr. Keisha Morgan (Environmental Scholar)",
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
      instructor: "Zara Chen (Digital Strategist)",
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

  // Widget conversation history
  const widgetHistory = [];

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
    sendBtn.disabled = true;
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

    // Teaching commands handled locally (no API needed)
    const teachReply = processTeachingCommands(cleanText);

    let responseText;
    if (teachReply) {
      await new Promise(r => setTimeout(r, 600 + Math.random() * 200));
      responseText = teachReply;
    } else if (typeof callGemini === 'function' && sessionStorage.getItem('rt_gemini_key')) {
      // Live Gemini response
      widgetHistory.push({ role: 'user', text });
      responseText = await callGemini(text, widgetHistory.slice(0, -1));
      widgetHistory.push({ role: 'model', text: responseText });
    } else {
      // Keyword fallback when no key present
      await new Promise(r => setTimeout(r, 850 + Math.random() * 300));
      responseText = defaultResponse;
      const sortedKeys = Object.keys(keywords).sort((a, b) => b.length - a.length);
      for (const key of sortedKeys) {
        if (cleanText.includes(key)) {
          responseText = keywords[key];
          break;
        }
      }
    }

    indicator.remove();
    const aiBubble = document.createElement('div');
    aiBubble.className = 'chat-bubble ai';
    aiBubble.innerHTML = responseText.replace(/\n/g, '<br>').replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    messagesArea.appendChild(aiBubble);
    messagesArea.scrollTop = messagesArea.scrollHeight;
    sendBtn.disabled = false;
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
   17. SESSION BOOKING MODAL
──────────────────────────────────────────── */
(function initBookingModal() {
  // Inject styles
  const style = document.createElement('style');
  style.textContent = `
    #booking-overlay {
      position: fixed; inset: 0; z-index: 99998;
      background: rgba(0,0,0,0.85); backdrop-filter: blur(10px);
      display: none; align-items: center; justify-content: center;
      font-family: var(--font-sans, system-ui, sans-serif);
    }
    #booking-overlay.open { display: flex; }
    #booking-modal {
      background: #1c1c1f; border: 1px solid rgba(201,168,76,0.35);
      border-radius: 14px; width: 90%; max-width: 480px;
      max-height: 90vh; overflow-y: auto;
      box-shadow: 0 16px 48px rgba(0,0,0,0.6); color: #fff;
      box-sizing: border-box;
    }
    #booking-modal .bk-header {
      background: #252528; padding: 18px 22px;
      border-bottom: 1px solid rgba(201,168,76,0.2);
      border-radius: 14px 14px 0 0;
      display: flex; justify-content: space-between; align-items: center;
    }
    #booking-modal .bk-header h3 {
      margin: 0; font-size: 15px; color: #c9a84c;
      text-transform: uppercase; letter-spacing: 0.5px;
      display: flex; align-items: center; gap: 8px;
    }
    #booking-modal .bk-close {
      background: none; border: none; color: #9ca3af;
      font-size: 22px; cursor: pointer; line-height: 1; padding: 2px 6px;
    }
    #booking-modal .bk-close:hover { color: #fff; }
    #booking-modal .bk-body { padding: 22px; display: flex; flex-direction: column; gap: 16px; }
    #booking-modal .bk-instructor-badge {
      display: flex; align-items: center; gap: 12px;
      background: rgba(201,168,76,0.07); border: 1px solid rgba(201,168,76,0.2);
      border-radius: 8px; padding: 12px 14px;
    }
    #booking-modal .bk-instructor-badge .bk-avatar {
      width: 42px; height: 42px; border-radius: 50%;
      background: linear-gradient(135deg,#c9a84c,#a18035);
      display: flex; align-items: center; justify-content: center;
      font-weight: 900; font-size: 16px; color: #111; flex-shrink: 0;
    }
    #booking-modal label {
      display: block; font-size: 12px; font-weight: 700;
      color: #a1a1aa; text-transform: uppercase; letter-spacing: 0.4px;
      margin-bottom: 6px;
    }
    #booking-modal input, #booking-modal select, #booking-modal textarea {
      width: 100%; padding: 11px 13px; background: #121212;
      border: 1px solid #3f3f46; border-radius: 7px; color: #fff;
      font-size: 13px; outline: none; box-sizing: border-box;
      transition: border-color 0.2s;
    }
    #booking-modal input:focus, #booking-modal select:focus, #booking-modal textarea:focus {
      border-color: #c9a84c;
    }
    #booking-modal select option { background: #1c1c1f; }
    #booking-modal textarea { resize: vertical; min-height: 90px; }
    #booking-modal .bk-calendar {
      display: grid; grid-template-columns: repeat(7,1fr); gap: 4px;
    }
    #booking-modal .bk-calendar .bk-day-label {
      text-align: center; font-size: 10px; color: #6b7280;
      font-weight: 700; padding: 2px 0;
    }
    #booking-modal .bk-calendar .bk-day {
      text-align: center; padding: 7px 2px; border-radius: 6px;
      font-size: 12px; cursor: pointer; border: 1px solid transparent;
      transition: all 0.15s; color: #cbd5e1;
    }
    #booking-modal .bk-calendar .bk-day:hover:not(.bk-day-disabled) {
      background: rgba(201,168,76,0.15); border-color: rgba(201,168,76,0.4);
    }
    #booking-modal .bk-calendar .bk-day.selected {
      background: #c9a84c; color: #111; font-weight: 800;
      border-color: #c9a84c;
    }
    #booking-modal .bk-calendar .bk-day-disabled {
      color: #3f3f46; cursor: default;
    }
    #booking-modal .bk-calendar .bk-day-empty { visibility: hidden; }
    #booking-modal .bk-month-nav {
      display: flex; justify-content: space-between; align-items: center;
      margin-bottom: 10px;
    }
    #booking-modal .bk-month-nav button {
      background: #252528; border: 1px solid #3f3f46; color: #cbd5e1;
      border-radius: 6px; padding: 4px 10px; cursor: pointer; font-size: 14px;
    }
    #booking-modal .bk-month-nav button:hover { border-color: #c9a84c; color: #c9a84c; }
    #booking-modal .bk-month-nav span {
      font-weight: 700; font-size: 13px; color: #fff;
    }
    #booking-modal .bk-time-slots {
      display: grid; grid-template-columns: repeat(3,1fr); gap: 8px;
    }
    #booking-modal .bk-time-slot {
      text-align: center; padding: 8px 4px; border-radius: 6px;
      font-size: 12px; cursor: pointer; border: 1px solid #3f3f46;
      color: #cbd5e1; transition: all 0.15s;
    }
    #booking-modal .bk-time-slot:hover { border-color: rgba(201,168,76,0.5); color: #c9a84c; }
    #booking-modal .bk-time-slot.selected {
      background: rgba(201,168,76,0.15); border-color: #c9a84c; color: #c9a84c; font-weight: 700;
    }
    #booking-modal .bk-divider {
      border: none; border-top: 1px solid #2e2e2e; margin: 4px 0;
    }
    #booking-modal .bk-actions { display: flex; gap: 10px; }
    #booking-modal .bk-btn-primary {
      flex: 1; padding: 12px; background: #c9a84c; color: #111;
      border: none; border-radius: 8px; font-weight: 800;
      font-size: 14px; cursor: pointer; transition: 0.2s;
    }
    #booking-modal .bk-btn-primary:hover { background: #b8973e; }
    #booking-modal .bk-btn-primary:disabled {
      background: #3f3f46; color: #6b7280; cursor: default;
    }
    #booking-modal .bk-btn-secondary {
      padding: 12px 18px; background: transparent;
      border: 1px solid #3f3f46; border-radius: 8px;
      color: #9ca3af; cursor: pointer; font-size: 13px; transition: 0.2s;
    }
    #booking-modal .bk-btn-secondary:hover { border-color: #9ca3af; color: #fff; }
    #booking-modal .bk-success {
      display: none; text-align: center; padding: 20px 0;
    }
    #booking-modal .bk-success .bk-success-icon {
      font-size: 48px; margin-bottom: 12px;
    }
    #booking-modal .bk-success h4 {
      color: #10b981; font-size: 18px; margin: 0 0 8px;
    }
    #booking-modal .bk-success p {
      color: #9ca3af; font-size: 13px; line-height: 1.6; margin: 0;
    }
  `;
  document.head.appendChild(style);

  // Build overlay + modal shell
  const overlay = document.createElement('div');
  overlay.id = 'booking-overlay';
  overlay.innerHTML = `
    <div id="booking-modal">
      <div class="bk-header">
        <h3>📅 Book a Strategy Session</h3>
        <button class="bk-close" id="bk-close-btn">&times;</button>
      </div>
      <div class="bk-body" id="bk-form-body">

        <!-- Instructor badge -->
        <div class="bk-instructor-badge">
          <div class="bk-avatar" id="bk-avatar-initials">AO</div>
          <div>
            <div style="font-weight:800;font-size:14px;" id="bk-instructor-name">Instructor</div>
            <div style="font-size:12px;color:#a1a1aa;" id="bk-instructor-role">Radiant Threshold</div>
            <div style="font-size:12px;color:#c9a84c;margin-top:2px;" id="bk-session-price">$150 / session</div>
          </div>
        </div>

        <hr class="bk-divider"/>

        <!-- Calendar -->
        <div>
          <label>Select Date</label>
          <div class="bk-month-nav">
            <button id="bk-prev-month">&#8249;</button>
            <span id="bk-month-label"></span>
            <button id="bk-next-month">&#8250;</button>
          </div>
          <div class="bk-calendar" id="bk-calendar-grid"></div>
        </div>

        <!-- Time slots -->
        <div id="bk-time-section">
          <label>Select Time <span style="color:#6b7280;font-weight:400;text-transform:none;">(Eastern Time)</span></label>
          <div class="bk-time-slots" id="bk-time-slots"></div>
        </div>

        <hr class="bk-divider"/>

        <!-- Contact fields -->
        <div>
          <label>Your Name</label>
          <input type="text" id="bk-name" placeholder="Full name" />
        </div>
        <div>
          <label>Your Email</label>
          <input type="email" id="bk-email" placeholder="your@email.com" />
        </div>
        <div>
          <label>Session Topic / Message to Instructor</label>
          <textarea id="bk-message" placeholder="Briefly describe what you'd like to work on in this session..."></textarea>
        </div>

        <hr class="bk-divider"/>

        <!-- Contact method toggle -->
        <div>
          <label>How would you like the instructor to confirm?</label>
          <div style="display:flex;gap:10px;margin-top:2px;">
            <button class="bk-toggle-btn" id="bk-toggle-email" onclick="window._bkSetContact('email')"
              style="flex:1;padding:10px;border-radius:7px;border:1px solid #c9a84c;background:rgba(201,168,76,0.12);color:#c9a84c;font-weight:700;font-size:12px;cursor:pointer;">
              ✉️ Email
            </button>
            <button class="bk-toggle-btn" id="bk-toggle-dm" onclick="window._bkSetContact('dm')"
              style="flex:1;padding:10px;border-radius:7px;border:1px solid #3f3f46;background:transparent;color:#9ca3af;font-size:12px;cursor:pointer;">
              💬 Direct Message
            </button>
          </div>
          <div id="bk-dm-note" style="display:none;margin-top:8px;font-size:12px;color:#9ca3af;background:#18181b;border:1px solid #2e2e2e;border-radius:6px;padding:10px;">
            The instructor will reach out to you at the email address you provided above via a secure direct message channel.
          </div>
        </div>

        <div class="bk-actions">
          <button class="bk-btn-primary" id="bk-submit-btn">Send Booking Request</button>
          <button class="bk-btn-secondary" id="bk-cancel-btn">Cancel</button>
        </div>

      </div>

      <!-- Success state -->
      <div class="bk-success" id="bk-success">
        <div class="bk-success-icon">✅</div>
        <h4>Booking Request Sent!</h4>
        <p id="bk-success-msg">Your request has been sent. The instructor will confirm your session shortly.</p>
        <button class="bk-btn-primary" style="margin-top:20px;width:100%;" onclick="window.closeBookingModal()">Close</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  // State
  let _instructor = { name: '', role: '', price: '', initials: '' };
  let _selectedDate = null;
  let _selectedTime = null;
  let _contactMethod = 'email';
  let _calYear, _calMonth;

  const TIMES = ['9:00 AM','10:00 AM','11:00 AM','12:00 PM','1:00 PM','2:00 PM','3:00 PM','4:00 PM','5:00 PM'];
  const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const DAYS = ['Su','Mo','Tu','We','Th','Fr','Sa'];

  function initCal() {
    const now = new Date();
    _calYear = now.getFullYear();
    _calMonth = now.getMonth();
    renderCal();
  }

  function renderCal() {
    document.getElementById('bk-month-label').textContent = `${MONTHS[_calMonth]} ${_calYear}`;
    const grid = document.getElementById('bk-calendar-grid');
    grid.innerHTML = DAYS.map(d => `<div class="bk-day-label">${d}</div>`).join('');

    const firstDay = new Date(_calYear, _calMonth, 1).getDay();
    const daysInMonth = new Date(_calYear, _calMonth + 1, 0).getDate();
    const today = new Date(); today.setHours(0,0,0,0);

    for (let i = 0; i < firstDay; i++) {
      grid.innerHTML += `<div class="bk-day bk-day-empty"></div>`;
    }
    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(_calYear, _calMonth, d);
      const isPast = date < today;
      const isWeekend = date.getDay() === 0 || date.getDay() === 6;
      const disabled = isPast || isWeekend;
      const isSelected = _selectedDate && date.toDateString() === _selectedDate.toDateString();
      grid.innerHTML += `<div class="bk-day${disabled ? ' bk-day-disabled' : ''}${isSelected ? ' selected' : ''}"
        ${!disabled ? `onclick="window._bkSelectDate(${_calYear},${_calMonth},${d})"` : ''}>
        ${d}
      </div>`;
    }
  }

  function renderTimeSlots() {
    const container = document.getElementById('bk-time-slots');
    container.innerHTML = TIMES.map(t => `
      <div class="bk-time-slot${_selectedTime === t ? ' selected' : ''}" onclick="window._bkSelectTime('${t}')">
        ${t}
      </div>
    `).join('');
  }

  // Public API
  window._bkSelectDate = function(y, m, d) {
    _selectedDate = new Date(y, m, d);
    _selectedTime = null;
    renderCal();
    renderTimeSlots();
    document.getElementById('bk-time-section').style.display = 'block';
  };

  window._bkSelectTime = function(t) {
    _selectedTime = t;
    renderTimeSlots();
  };

  window._bkSetContact = function(method) {
    _contactMethod = method;
    const emailBtn = document.getElementById('bk-toggle-email');
    const dmBtn = document.getElementById('bk-toggle-dm');
    const dmNote = document.getElementById('bk-dm-note');
    if (method === 'email') {
      emailBtn.style.cssText += 'border-color:#c9a84c;background:rgba(201,168,76,0.12);color:#c9a84c;font-weight:700;';
      dmBtn.style.cssText += 'border-color:#3f3f46;background:transparent;color:#9ca3af;font-weight:400;';
      dmNote.style.display = 'none';
    } else {
      dmBtn.style.cssText += 'border-color:#c9a84c;background:rgba(201,168,76,0.12);color:#c9a84c;font-weight:700;';
      emailBtn.style.cssText += 'border-color:#3f3f46;background:transparent;color:#9ca3af;font-weight:400;';
      dmNote.style.display = 'block';
    }
  };

  window.openBookingModal = function(instructorName, instructorRole, price) {
    _instructor = {
      name: instructorName,
      role: instructorRole,
      price: price || '$150 / session',
      initials: instructorName.split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase()
    };
    _selectedDate = null;
    _selectedTime = null;
    _contactMethod = 'email';

    document.getElementById('bk-instructor-name').textContent = _instructor.name;
    document.getElementById('bk-instructor-role').textContent = _instructor.role;
    document.getElementById('bk-session-price').textContent = _instructor.price;
    document.getElementById('bk-avatar-initials').textContent = _instructor.initials;
    document.getElementById('bk-name').value = '';
    document.getElementById('bk-email').value = '';
    document.getElementById('bk-message').value = '';
    document.getElementById('bk-time-section').style.display = 'none';
    document.getElementById('bk-form-body').style.display = 'flex';
    document.getElementById('bk-success').style.display = 'none';
    window._bkSetContact('email');
    initCal();
    overlay.classList.add('open');
  };

  window.closeBookingModal = function() {
    overlay.classList.remove('open');
  };

  // Submit
  document.getElementById('bk-submit-btn').addEventListener('click', function() {
    const name = document.getElementById('bk-name').value.trim();
    const email = document.getElementById('bk-email').value.trim();
    const message = document.getElementById('bk-message').value.trim();

    if (!name || !email) {
      alert('Please enter your name and email.');
      return;
    }
    if (!_selectedDate) {
      alert('Please select a date.');
      return;
    }
    if (!_selectedTime) {
      alert('Please select a time slot.');
      return;
    }

    const dateStr = _selectedDate.toLocaleDateString('en-US', { weekday:'long', year:'numeric', month:'long', day:'numeric' });
    const subject = encodeURIComponent(`Session Booking Request — ${_instructor.name}`);
    const body = encodeURIComponent(
`SESSION BOOKING REQUEST
=======================
Instructor: ${_instructor.name}
Role: ${_instructor.role}
Requested Date: ${dateStr}
Requested Time: ${_selectedTime} ET
Confirmation via: ${_contactMethod === 'email' ? 'Email' : 'Direct Message'}

--- APPLICANT INFO ---
Name: ${name}
Email: ${email}

--- SESSION TOPIC / MESSAGE ---
${message || '(No message provided)'}

---
Sent via Radiant Threshold Booking System`
    );

    window.open(`mailto:IRNVP@pm.me?subject=${subject}&body=${body}`, '_blank');

    document.getElementById('bk-form-body').style.display = 'none';
    document.getElementById('bk-success').style.display = 'block';
    document.getElementById('bk-success-msg').textContent =
      _contactMethod === 'email'
        ? `Your booking request for ${_instructor.name} on ${dateStr} at ${_selectedTime} ET has been sent to IRNVP@pm.me. Expect a confirmation within 24–48 hours.`
        : `Your booking request has been sent. ${_instructor.name} will reach out to you via direct message to confirm your session.`;
  });

  // Close handlers
  document.getElementById('bk-close-btn').addEventListener('click', window.closeBookingModal);
  document.getElementById('bk-cancel-btn').addEventListener('click', window.closeBookingModal);
  overlay.addEventListener('click', e => { if (e.target === overlay) window.closeBookingModal(); });

  document.getElementById('bk-prev-month').addEventListener('click', () => {
    _calMonth--; if (_calMonth < 0) { _calMonth = 11; _calYear--; }
    renderCal();
  });
  document.getElementById('bk-next-month').addEventListener('click', () => {
    _calMonth++; if (_calMonth > 11) { _calMonth = 0; _calYear++; }
    renderCal();
  });

  // Wire up any existing "Book a Session" buttons on the page
  document.addEventListener('DOMContentLoaded', function() {
    wireBkButtons();
  });
  // Also run immediately in case DOM is already ready
  wireBkButtons();

  function wireBkButtons() {
    document.querySelectorAll('a.btn').forEach(btn => {
      if (btn.textContent.trim() === 'Book a Session' && btn.getAttribute('href') === '#') {
        btn.addEventListener('click', function(e) {
          e.preventDefault();
          // Detect instructor from page context
          const nameEl = document.querySelector('.instructor-hero-info h1');
          const roleEl = document.querySelector('.instructor-tagline');
          const name = nameEl ? nameEl.textContent.trim() : 'Instructor';
          const role = roleEl ? roleEl.textContent.trim() : 'Radiant Threshold';
          const price = '$150 / session';
          window.openBookingModal(name, role, price);
        });
      }
    });
  }
})();

