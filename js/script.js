// Ano dinâmico no footer
document.getElementById('year').textContent = new Date().getFullYear();

// Header com fundo ao rolar
const header = document.getElementById('header');
window.addEventListener('scroll', () => {
  header.classList.toggle('scrolled', window.scrollY > 10);
});

// Menu mobile
const navToggle = document.getElementById('navToggle');
const nav = document.getElementById('nav');
navToggle.addEventListener('click', () => {
  nav.classList.toggle('open');
});
nav.querySelectorAll('a').forEach(link => {
  link.addEventListener('click', () => nav.classList.remove('open'));
});

// Animação de revelação ao rolar
const revealEls = document.querySelectorAll('.reveal');
const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('is-visible');
      observer.unobserve(entry.target);
    }
  });
}, { threshold: 0.15 });
revealEls.forEach(el => observer.observe(el));

// Contador animado
function animateCount(el, target, duration, prefix, suffix, decimals) {
  if (!el) return;
  let start = 0;
  const step = target / (duration / 16);
  const timer = setInterval(() => {
    start = Math.min(start + step, target);
    el.textContent = (prefix || '') + (decimals ? start.toFixed(1) : Math.floor(start)) + (suffix || '');
    if (start >= target) clearInterval(timer);
  }, 16);
}

// Placar + resultados — carregados de data/metrics.json (editável direto no GitHub,
// sem precisar mexer em HTML/CSS/JS. Basta trocar os valores e commitar.)
fetch('data/metrics.json')
  .then(res => res.json())
  .then(data => {
    const p = data.placar;
    document.getElementById('m-leads-delta').textContent = p.leads.delta;
    document.getElementById('m-cpl-delta').textContent = p.cpl.delta;
    document.getElementById('m-buscas-delta').textContent = p.buscas.delta;
    document.getElementById('m-roas-delta').textContent = p.roas.delta;
    document.getElementById('m-updated').textContent = data.atualizadoEm;

    const metaBar = document.getElementById('m-meta-bar');
    const metaPct = document.getElementById('m-meta-pct');
    const orcBar = document.getElementById('m-orc-bar');
    const orcPct = document.getElementById('m-orc-pct');

    data.resultados.forEach((r, i) => {
      const n = i + 1;
      const valorEl = document.getElementById('r' + n + '-valor');
      const labelEl = document.getElementById('r' + n + '-label');
      if (valorEl) valorEl.textContent = r.valor;
      if (labelEl) labelEl.textContent = r.label;
    });

    window.addEventListener('load', () => {
      setTimeout(() => {
        animateCount(document.getElementById('m-leads'), p.leads.valor, 1800, '', '', false);
        animateCount(document.getElementById('m-cpl'), p.cpl.valor, 1800, '', '', false);
        animateCount(document.getElementById('m-buscas'), p.buscas.valor, 1800, '', '', false);
        animateCount(document.getElementById('m-roas'), p.roas.valor, 1800, '', '', true);

        let pct = 0;
        const metaTarget = data.metaMesPct;
        const orcTarget = data.orcamentoUsadoPct;
        const barTimer = setInterval(() => {
          pct = Math.min(pct + 1.2, metaTarget);
          metaBar.style.width = pct + '%';
          metaPct.textContent = Math.floor(pct) + '%';
          const b = Math.min((pct / metaTarget) * orcTarget, orcTarget);
          orcBar.style.width = b + '%';
          orcPct.textContent = Math.floor(b) + '%';
          if (pct >= metaTarget) clearInterval(barTimer);
        }, 22);
      }, 400);
    });
  })
  .catch(() => {
    console.warn('Não foi possível carregar data/metrics.json — placar não será exibido com dados reais.');
  });

// FAQ — abre/fecha uma pergunta por vez
function toggleFaq(btn) {
  const item = btn.parentElement;
  const isOpen = item.classList.contains('is-open');
  document.querySelectorAll('.faq-item').forEach(i => i.classList.remove('is-open'));
  if (!isOpen) item.classList.add('is-open');
}

// Formulário de contato — Formspree
async function submitForm() {
  const nome = document.getElementById('f-nome').value.trim();
  const negocio = document.getElementById('f-negocio').value.trim();
  const whats = document.getElementById('f-whats').value.trim();
  const email = document.getElementById('f-email').value.trim();
  const interesse = document.getElementById('f-interesse').value;
  const msg = document.getElementById('f-msg').value.trim();

  if (!nome || (!whats && !email) || !interesse) {
    alert('Por favor, preencha nome, WhatsApp ou e-mail, e o serviço de interesse.');
    return;
  }

  const btn = document.querySelector('.form-submit');
  const originalText = btn.textContent;
  btn.textContent = 'Enviando...';
  btn.disabled = true;

  try {
    const res = await fetch('https://formspree.io/f/xykanqyb', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ nome, negocio, whatsapp: whats, email, interesse, mensagem: msg })
    });

    if (res.ok) {
      document.getElementById('form-body').style.display = 'none';
      document.getElementById('form-success').style.display = 'block';
      document.getElementById('success-nome').textContent = nome.split(' ')[0];
    } else {
      btn.textContent = originalText;
      btn.disabled = false;
      alert('Não foi possível enviar. Tente pelo WhatsApp ou e-mail diretamente.');
    }
  } catch (e) {
    btn.textContent = originalText;
    btn.disabled = false;
    alert('Erro de conexão. Tente pelo WhatsApp ou e-mail diretamente.');
  }
}
