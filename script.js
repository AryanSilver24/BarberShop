// Nav scroll
const nav = document.getElementById('mainNav');
window.addEventListener('scroll', () => {
  nav.classList.toggle('scrolled', window.scrollY > 60);
});

// Mobile menu
const hamburger = document.getElementById('hamburger');
const mobileMenu = document.getElementById('mobileMenu');
const mobileClose = document.getElementById('mobileClose');
hamburger.addEventListener('click', () => mobileMenu.classList.add('open'));
mobileClose.addEventListener('click', () => mobileMenu.classList.remove('open'));
document.querySelectorAll('.mobile-link').forEach(link => {
  link.addEventListener('click', () => mobileMenu.classList.remove('open'));
});

// Set min date on booking
const dateInput = document.getElementById('date');
if (dateInput) {
  const today = new Date().toISOString().split('T')[0];
  dateInput.setAttribute('min', today);
}

// ─── Loaded from config.js (not on GitHub) ───
const APPS_SCRIPT_URL = (typeof CONFIG !== 'undefined' && CONFIG.APPS_SCRIPT_URL && CONFIG.APPS_SCRIPT_URL !== 'YOUR_GOOGLE_APPS_SCRIPT_URL_HERE' && CONFIG.APPS_SCRIPT_URL !== 'PASTE_YOUR_APPS_SCRIPT_URL_HERE')
  ? CONFIG.APPS_SCRIPT_URL
  : 'https://script.google.com/macros/s/AKfycbz2U5e6QdoVi80QGdIJMtLaucYnkwd5N7lFL35JQLaqtxBy9gdbix1n1dWkZCKYZJr4Eg/exec';
const REVIEW_SCRIPT_URL = (typeof CONFIG !== 'undefined' && CONFIG.REVIEW_SCRIPT_URL && CONFIG.REVIEW_SCRIPT_URL !== 'YOUR_REVIEW_GOOGLE_APPS_SCRIPT_URL_HERE')
  ? CONFIG.REVIEW_SCRIPT_URL
  : 'https://script.google.com/macros/s/AKfycbz7i7AgVkV2n5yGZblwVXoRgo1JNUjHvPHhylypcRO_jka8g9OJmqogYi9JwCUqBeAhMw/exec';

// ─── PROMO CODE & PRICING LOGIC ───
let activePromo = null;

const PROMO_CODES = {
  'FIRST10': { type: 'percent', value: 10, label: '10% OFF' },
  'IRON20': { type: 'amount', value: 20, min: 40, label: '$20 OFF' },
  'EDGE50': { type: 'percent', value: 50, label: '50% OFF VIP' },
  'BARBER5': { type: 'amount', value: 5, label: '$5 OFF' }
};

function getServiceBasePrice(serviceStr) {
  if (!serviceStr) return 0;
  const match = serviceStr.match(/\$(\d+)/);
  return match ? parseInt(match[1]) : 0;
}

function updatePriceSummary() {
  const serviceSelect = document.getElementById('service');
  const priceSummary = document.getElementById('priceSummary');
  if (!serviceSelect || !priceSummary) return;

  const basePrice = getServiceBasePrice(serviceSelect.value);
  if (basePrice <= 0) {
    priceSummary.style.display = 'none';
    return;
  }

  priceSummary.style.display = 'flex';
  document.getElementById('summaryBasePrice').textContent = `$${basePrice}`;

  let discount = 0;
  const discountRow = document.getElementById('summaryDiscountRow');

  if (activePromo) {
    const promo = PROMO_CODES[activePromo];
    if (promo) {
      if (promo.min && basePrice < promo.min) {
        discountRow.style.display = 'none';
      } else {
        if (promo.type === 'percent') {
          discount = Math.round((basePrice * promo.value) / 100);
        } else if (promo.type === 'amount') {
          discount = Math.min(basePrice, promo.value);
        }
        discountRow.style.display = 'flex';
        document.getElementById('summaryPromoName').textContent = activePromo;
        document.getElementById('summaryDiscountAmount').textContent = `-$${discount}`;
      }
    }
  } else {
    discountRow.style.display = 'none';
  }

  const finalPrice = Math.max(0, basePrice - discount);
  document.getElementById('summaryTotalPrice').textContent = `$${finalPrice}`;
}

function applyPromoCode() {
  const codeInput = document.getElementById('promoCode');
  const feedback = document.getElementById('promoFeedback');
  const serviceSelect = document.getElementById('service');

  if (!codeInput || !feedback) return;
  const code = codeInput.value.trim().toUpperCase();

  if (!code) {
    activePromo = null;
    feedback.className = 'promo-feedback error';
    feedback.textContent = 'Please enter a promo code.';
    updatePriceSummary();
    return;
  }

  const basePrice = getServiceBasePrice(serviceSelect ? serviceSelect.value : '');

  if (!PROMO_CODES[code]) {
    activePromo = null;
    feedback.className = 'promo-feedback error';
    feedback.textContent = 'Invalid promo code. Try FIRST10, IRON20, or BARBER5.';
    updatePriceSummary();
    return;
  }

  const promo = PROMO_CODES[code];
  if (promo.min && basePrice > 0 && basePrice < promo.min) {
    activePromo = null;
    feedback.className = 'promo-feedback error';
    feedback.textContent = `Code ${code} requires a service price of at least $${promo.min}.`;
    updatePriceSummary();
    return;
  }

  activePromo = code;
  feedback.className = 'promo-feedback success';
  feedback.textContent = `✓ Promo code ${code} (${promo.label}) applied!`;
  updatePriceSummary();
}

const serviceSelectElem = document.getElementById('service');
if (serviceSelectElem) {
  serviceSelectElem.addEventListener('change', updatePriceSummary);
}

async function handleBooking() {
  const fname    = document.getElementById('fname').value.trim();
  const lname    = document.getElementById('lname').value.trim();
  const email    = document.getElementById('email').value.trim();
  const service  = document.getElementById('service').value;
  const barber   = document.getElementById('barber').value || 'Any';
  const date     = document.getElementById('date').value;
  const time     = document.getElementById('time').value;

  if (!fname || !email || !service || !date || !time) {
    showFormError('Please fill in all required fields before confirming.');
    return;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    showFormError('Please enter a valid email address.');
    return;
  }

  const submitBtn = document.querySelector('.form-submit');
  submitBtn.textContent = 'Sending…';
  submitBtn.disabled = true;
  clearFormError();

  const basePrice = getServiceBasePrice(service);
  let discount = 0;
  if (activePromo && PROMO_CODES[activePromo]) {
    const p = PROMO_CODES[activePromo];
    if (!p.min || basePrice >= p.min) {
      discount = p.type === 'percent' ? Math.round((basePrice * p.value)/100) : Math.min(basePrice, p.value);
    }
  }
  const finalPrice = Math.max(0, basePrice - discount);

  const payload = {
    name: fname + ' ' + lname,
    email,
    service,
    barber,
    date,
    time,
    basePrice,
    promoCode: activePromo || 'NONE',
    discountAmount: discount,
    finalPrice,
    bookedAt: new Date().toISOString()
  };

  if (!APPS_SCRIPT_URL) {
    submitBtn.textContent = 'Confirm Booking';
    submitBtn.disabled = false;
    showFormError('Booking system not configured yet. Please call us to book.');
    return;
  }

  try {
    await fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    // no-cors means we can't read the response — assume success
    showSuccess();
  } catch (err) {
    submitBtn.textContent = 'Confirm Booking';
    submitBtn.disabled = false;
    showFormError('Connection error. Please call us or try again.');
  }
}

function showSuccess() {
  document.getElementById('bookingFormWrap').style.display = 'none';
  document.getElementById('successMsg').classList.add('show');
}

function showFormError(msg) {
  let el = document.getElementById('formError');
  if (!el) {
    el = document.createElement('p');
    el.id = 'formError';
    el.style.cssText = 'color:#E24B4A;font-size:0.82rem;margin-top:-0.5rem;margin-bottom:1rem;';
    document.querySelector('.form-submit').before(el);
  }
  el.textContent = msg;
}

function clearFormError() {
  const el = document.getElementById('formError');
  if (el) el.textContent = '';
}

// ─────────────────────────────
// ─────────────────────────────
// REVIEWS SYSTEM
// ─────────────────────────────

const defaultTestimonials = [
  { name: "James Vance", rating: 5, text: "Best haircut in town hands down. Marcus listened to exactly what I wanted and delivered perfection." },
  { name: "David Miller", rating: 5, text: "The hot towel shave experience is pure luxury. Clean, sharp, and traditional barbershop vibe." },
  { name: "Thomas Clark", rating: 5, text: "Unmatched attention to detail. Danny is a master with the clippers. Highly recommended!" }
];

function getLocalReviews() {
  try {
    const saved = localStorage.getItem('userReviews');
    return saved ? JSON.parse(saved) : [];
  } catch (e) {
    return [];
  }
}

function saveLocalReview(review) {
  try {
    const reviews = getLocalReviews();
    reviews.unshift(review);
    localStorage.setItem('userReviews', JSON.stringify(reviews));
  } catch (e) {
    console.error("Could not save review locally", e);
  }
}

let testimonials = [...getLocalReviews(), ...defaultTestimonials];
const reviewsPerPage = 3;
let currentPage = 1;

// LOAD REVIEWS FROM GOOGLE SHEETS
async function fetchReviews() {
  try {
    const response = await fetch(REVIEW_SCRIPT_URL);
    const data = await response.json();
    if (Array.isArray(data) && data.length > 0) {
      const remote = data.reverse();
      const local = getLocalReviews();
      testimonials = [...local, ...remote.filter(r => !local.some(l => l.name === r.name && l.text === r.text))];
      loadReviews(1);
    } else {
      loadReviews(1);
    }
  } catch (err) {
    loadReviews(1);
  }
}

// LOAD REVIEWS INTO PAGE
function loadReviews(page = 1) {
  currentPage = page;
  const testimonialsGrid = document.getElementById('testimonialsGrid');
  if (!testimonialsGrid) return;

  testimonialsGrid.innerHTML = "";

  const start = (page - 1) * reviewsPerPage;
  const end = start + reviewsPerPage;
  const reviewsToShow = testimonials.slice(start, end);

  if (reviewsToShow.length === 0) {
    testimonialsGrid.innerHTML = `<div style="grid-column: 1/-1; text-align: center; color: var(--text-muted); padding: 2rem;">No reviews yet. Be the first to leave one above!</div>`;
    renderPagination();
    return;
  }

  reviewsToShow.forEach((review, index) => {
    const card = document.createElement('div');
    card.className = 'testimonial-card';
    card.style.animation = 'fadeIn 0.5s ease both';
    card.style.animationDelay = `${index * 0.1}s`;

    const starsHtml = "★".repeat(review.rating) + "☆".repeat(Math.max(0, 5 - review.rating));

    card.innerHTML = `
      <div class="stars">${starsHtml}</div>
      <p class="testimonial-text">"${review.text}"</p>
      <div class="testimonial-author">
        <div class="author-avatar">${(review.name || 'C').charAt(0).toUpperCase()}</div>
        <div>
          <div class="author-name">${review.name || 'Client'}</div>
          <div class="author-since">Verified Client</div>
        </div>
      </div>
    `;

    testimonialsGrid.appendChild(card);
  });

  renderPagination();
}

// PAGINATION
function renderPagination() {
  const pagination = document.getElementById('pagination');
  if (!pagination) return;
  pagination.innerHTML = "";

  const totalPages = Math.ceil(testimonials.length / reviewsPerPage);
  if (totalPages <= 1) return;

  // PREVIOUS BUTTON
  const prevBtn = document.createElement("button");
  prevBtn.textContent = "←";
  prevBtn.disabled = currentPage === 1;
  prevBtn.onclick = () => {
    if (currentPage > 1) {
      loadReviews(currentPage - 1);
    }
  };
  pagination.appendChild(prevBtn);

  // PAGE NUMBERS
  for (let i = 1; i <= totalPages; i++) {
    const btn = document.createElement("button");
    btn.textContent = i;

    if (i === currentPage) {
      btn.classList.add("active");
    }

    btn.onclick = () => loadReviews(i);
    pagination.appendChild(btn);
  }

  // NEXT BUTTON
  const nextBtn = document.createElement("button");
  nextBtn.textContent = "→";
  nextBtn.disabled = currentPage === totalPages;
  nextBtn.onclick = () => {
    if (currentPage < totalPages) {
      loadReviews(currentPage + 1);
    }
  };

  pagination.appendChild(nextBtn);
}

// SUBMIT REVIEW
async function submitReview() {
  const nameInput = document.getElementById("reviewName");
  const ratingInput = document.getElementById("reviewRating");
  const textInput = document.getElementById("reviewText");

  const name = nameInput ? nameInput.value.trim() : "";
  const rating = ratingInput ? ratingInput.value : "";
  const text = textInput ? textInput.value.trim() : "";

  if (!name || !rating || !text) {
    showReviewNotice("Please fill in your name, rating, and review text.", true);
    return;
  }

  const newReview = {
    name: name,
    rating: parseInt(rating),
    text: text
  };

  // 1. Immediately add to local testimonials & render card below form
  saveLocalReview(newReview);
  testimonials.unshift(newReview);
  loadReviews(1);

  // 2. Clear inputs
  if (nameInput) nameInput.value = "";
  if (ratingInput) ratingInput.value = "";
  if (textInput) textInput.value = "";

  // 3. Show success notification
  showReviewNotice(`Thank you, ${name}! Your review has been published.`, false);

  // 4. Send background POST request to Google Apps Script
  const payload = {
    type: "review",
    name,
    rating,
    text
  };

  try {
    await fetch(REVIEW_SCRIPT_URL, {
      method: "POST",
      mode: "no-cors",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });
  } catch (err) {
    console.error("Could not sync review to remote sheet", err);
  }
}

function showReviewNotice(msg, isError) {
  let notice = document.getElementById('reviewNotice');
  if (!notice) {
    notice = document.createElement('div');
    notice.id = 'reviewNotice';
    const form = document.querySelector('.review-form');
    if (form) form.prepend(notice);
  }
  notice.style.cssText = `padding: 0.75rem 1rem; border-radius: 4px; font-size: 0.85rem; margin-bottom: 0.5rem; text-align: center; animation: fadeIn 0.3s ease; ${
    isError 
      ? 'background: rgba(226,75,74,0.15); color: #E24B4A; border: 1px solid rgba(226,75,74,0.3);' 
      : 'background: rgba(196,151,58,0.15); color: var(--gold); border: 1px solid rgba(196,151,58,0.3);'
  }`;
  notice.textContent = msg;

  setTimeout(() => {
    if (notice) notice.remove();
  }, 4000);
}

// INITIAL LOAD
fetchReviews();
