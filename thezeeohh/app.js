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
          <div class="chat-avatar" style="background-image: url('aziza-okoro.jpg'); border: 1px solid rgba(201,168,76,0.4);"></div>
          <div style="display: flex; flex-direction: column;">
            <span style="color: white; font-weight: 700; font-size: 0.88rem;">Aziza's AI Twin</span>
            <span style="color: #10b981; font-size: 0.72rem; display: flex; align-items: center; gap: 4px; font-weight: 600;">
              <span style="width: 6px; height: 6px; background-color: #10b981; border-radius: 50%; display: inline-block;"></span> Online &amp; organizing
            </span>
          </div>
        </div>
        <button id="chat-close-btn" class="chat-close-btn" aria-label="Close Chat">✕</button>
      </div>
      <div id="chat-messages" class="chat-messages">
        <div class="chat-bubble ai">
          Hey there! I'm Aziza's AI Twin, trained on my 20+ years of Baltimore grassroots organizing and mutual aid work. Ask me how to build tenant unions, organize mutual aid, map local power, or protect our community safety nets!
        </div>
      </div>
      <div class="chat-input-area">
        <input type="text" id="chat-input" placeholder="Ask Zee's AI Twin a question..." autocomplete="off">
        <button id="chat-send-btn" class="chat-send-btn">Send</button>
      </div>
    </div>
    <button id="chat-toggle-btn">
      💬 Chat with Zee's AI Twin
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
  const greeting = "Hey there! I'm Aziza's AI Twin, trained on my 20+ years of Baltimore grassroots organizing and mutual aid work. Ask me how to build tenant unions, organize mutual aid, map local power, or protect our community safety nets!";
  
  const defaultResponse = "Solidarity is our ultimate weapon. To build power, we need to focus on base building—going door-to-door, listening to people's material needs, and establishing direct mutual aid networks like food shares and tenant committees. Let me know what specific organizing struggle you're navigating.";

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
    "who": "I'm Aziza Okoro's AI Twin, trained on her 20+ years of grassroots organizing, tenant unionizing, and mutual aid work in Baltimore.",
    "course": "I teach 'The Organizer's Playbook' and 'Prison Abolition' here on Radiant Threshold. They cover the exact frameworks we use at the Injustice Reform Network to win campaigns."
  };

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
  function sendMessage() {
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

    // Generate response based on selected personality
    const cleanText = text.toLowerCase();
    let responseText = defaultResponse;

    // Find keyword match
    for (const key in keywords) {
      if (cleanText.includes(key)) {
        responseText = keywords[key];
        break;
      }
    }

    // Simulate delay
    setTimeout(() => {
      indicator.remove();
      const aiBubble = document.createElement('div');
      aiBubble.className = 'chat-bubble ai';
      aiBubble.textContent = responseText;
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
