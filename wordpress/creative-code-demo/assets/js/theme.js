/* Creative Code — demo theme JS (vanilla, no deps). Enqueue as theme.js in WP. */
(function () {
  'use strict';

  // ---- reveal on scroll + counters + process line
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (!entry.isIntersecting) return;
      var el = entry.target;
      el.classList.add('active');
      if (el.id === 'process') { var l = document.getElementById('process-line'); if (l) l.classList.add('active'); }
      el.querySelectorAll('.counter:not(.done)').forEach(function (c) {
        c.classList.add('done');
        var target = parseInt(c.getAttribute('data-target'), 10) || 0;
        var suffix = c.getAttribute('data-suffix') || '';
        var n = 0, step = Math.max(1, Math.ceil(target / 40));
        (function tick() { n = Math.min(target, n + step); c.textContent = n + suffix; if (n < target) setTimeout(tick, 30); })();
      });
      io.unobserve(el);
    });
  }, { threshold: 0.1 });
  document.querySelectorAll('.reveal-on-scroll, #process, .counter-wrap').forEach(function (el) { io.observe(el); });

  // ---- mobile menu
  var btn = document.getElementById('menu-btn'), menu = document.getElementById('mobile-menu');
  if (btn && menu) btn.addEventListener('click', function () {
    var open = menu.classList.toggle('hidden') === false;
    btn.setAttribute('aria-expanded', open);
  });

  // ---- landing-page mode (Google Ads final URL: ?lp=1)
  var qs = new URLSearchParams(location.search);
  if (qs.get('lp') === '1' || document.documentElement.hasAttribute('data-lp')) document.documentElement.classList.add('lp-mode');

  // ---- nav CTA: jump to the form on pages that have one
  document.querySelectorAll('.nav-cta').forEach(function (a) {
    var target = document.getElementById('quote') || document.getElementById('contact');
    a.setAttribute('href', target ? '#' + target.id : a.getAttribute('data-fallback'));
  });

  // ---- attribution (first touch, per session) -> hidden form fields
  var ATTR = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'gclid', 'fbclid'];
  var attr = {};
  try { attr = JSON.parse(sessionStorage.getItem('cc_attr') || '{}'); } catch (e) {}
  if (!attr.landing_page) {
    ATTR.forEach(function (k) { if (qs.get(k)) attr[k] = qs.get(k); });
    attr.landing_page = location.pathname;
    try { sessionStorage.setItem('cc_attr', JSON.stringify(attr)); } catch (e) {}
  }
  document.querySelectorAll('.cc-lead-form').forEach(function (f) {
    Object.keys(attr).forEach(function (k) { var i = f.querySelector('input[name="' + k + '"]'); if (i && !i.value) i.value = attr[k]; });
  });

  // ---- conversion events for GTM (Google Ads / GA4 / Meta via GTM tags)
  window.dataLayer = window.dataLayer || [];
  document.querySelectorAll('.cc-lead-form').forEach(function (f) {
    f.addEventListener('submit', function () {
      var s = f.querySelector('[name="service"]');
      window.dataLayer.push({ event: 'generate_lead', form_id: f.getAttribute('data-form'), service: s ? s.value : '' });
    });
  });
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[href]');
    if (!a) return;
    var h = a.getAttribute('href');
    if (h.indexOf('wa.me') > -1) window.dataLayer.push({ event: 'whatsapp_click', link_url: h });
    else if (h.indexOf('tel:') === 0) window.dataLayer.push({ event: 'phone_click' });
  });

  // ---- year
  document.querySelectorAll('[data-year]').forEach(function (y) { y.textContent = new Date().getFullYear(); });

  // ---- carousel (RTL-safe: uses scrollIntoView on slides)
  document.querySelectorAll('.cc-carousel').forEach(function (car) {
    var sec = car.closest('section') || car;
    var track = car.querySelector('.cc-track');
    var slides = Array.prototype.slice.call(track.children);
    var dotsWrap = car.querySelector('.cc-dots');
    var idx = 0, timer;
    if (!slides.length) return;
    slides.forEach(function (_, i) {
      var d = document.createElement('button');
      d.setAttribute('aria-label', 'الشريحة ' + (i + 1));
      d.addEventListener('click', function () { go(i); restart(); });
      dotsWrap.appendChild(d);
    });
    function paint() { Array.prototype.forEach.call(dotsWrap.children, function (d, i) { d.classList.toggle('active', i === idx); }); }
    function go(i) {
      idx = (i + slides.length) % slides.length;
      var s = slides[idx];
      track.scrollTo({ left: s.offsetLeft - (track.clientWidth - s.clientWidth) / 2, behavior: 'smooth' });
      paint();
    }
    var prev = sec.querySelector('.cc-prev'), next = sec.querySelector('.cc-next');
    if (prev) prev.addEventListener('click', function () { go(idx - 1); restart(); });
    if (next) next.addEventListener('click', function () { go(idx + 1); restart(); });
    var ms = parseInt(car.getAttribute('data-autoplay'), 10);
    function restart() { if (!ms) return; clearInterval(timer); timer = setInterval(function () { go(idx + 1); }, ms); }
    car.addEventListener('mouseenter', function () { clearInterval(timer); });
    car.addEventListener('mouseleave', restart);
    paint(); restart();
  });

  // ---- country pricing
  var P = window.CC_PRICING;
  if (P && document.querySelector('[data-price]')) {
    var KEY = 'cc_country';
    function getSaved() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }
    function save(c) { try { localStorage.setItem(KEY, c); } catch (e) {} }
    // In WP: server sets <html data-country="EG|SA"> from Cloudflare CF-IPCountry / GeoIP.
    var country = getSaved() || document.documentElement.getAttribute('data-country') || P.default;
    function fmt(v) { var n = Number(String(v).replace(/[^0-9.]/g, '')); return isNaN(n) ? v : n.toLocaleString('ar-EG'); }
    function apply(c) {
      var cfg = P[c] || P[P.default];
      document.querySelectorAll('[data-price]').forEach(function (el) {
        var path = el.getAttribute('data-price').split('.');
        var v = cfg[path[0]] && cfg[path[0]][path[1]];
        var box = el.parentNode.parentNode;
        var cur = el.parentNode.querySelector('[data-currency]');
        var extras = box.querySelectorAll('.price-from, .price-per');
        if (v) {
          el.textContent = fmt(v); el.style.fontSize = '';
          if (cur) { cur.textContent = cfg.currency; cur.hidden = false; }
          extras.forEach(function (x) { x.style.display = ''; });
        } else {
          el.textContent = 'السعر عند الطلب'; el.style.fontSize = '1.75rem';
          if (cur) cur.hidden = true;
          extras.forEach(function (x) { x.style.display = 'none'; });
        }
      });
      document.querySelectorAll('.country-btn').forEach(function (b) { b.classList.toggle('active', b.getAttribute('data-country') === c); });
    }
    document.querySelectorAll('.country-btn').forEach(function (b) {
      b.addEventListener('click', function () { country = b.getAttribute('data-country'); save(country); apply(country); });
    });
    apply(country);
  }

  // ---- generic filter (FAQ categories / case studies / blog)
  document.querySelectorAll('[data-filter-group]').forEach(function (group) {
    var target = document.querySelector(group.getAttribute('data-filter-group'));
    group.querySelectorAll('button').forEach(function (b) {
      b.addEventListener('click', function () {
        var f = b.getAttribute('data-f');
        group.querySelectorAll('button').forEach(function (x) { x.classList.toggle('active', x === b); });
        target.querySelectorAll('[data-filter]').forEach(function (it) {
          it.style.display = (f === 'all' || it.getAttribute('data-filter') === f) ? '' : 'none';
        });
      });
    });
  });
})();
