/**
 * POST /api/draw  — sorteio do Amigo Secreto
 * Body: { groupId: "k7m2xq9p" }   Header: Authorization: Bearer <token do Supabase>
 *
 * 1. Confere no Supabase quem é o usuário (pelo token da sessão).
 * 2. Chama draw_group com a service role: a função valida se é o organizador,
 *    sorteia em ciclo único e devolve e-mail/nome de cada participante.
 * 3. Envia um e-mail para cada pessoa com o amigo secreto dela (Resend, em lote).
 *
 * Variáveis de ambiente (Vercel → Settings → Environment Variables):
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY, MAIL_FROM, APP_URL
 */

const ERRORS = {
  SOMENTE_ORGANIZADOR: [403, 'Só administradores do grupo podem fazer o sorteio.'],
  MINIMO_3_PARTICIPANTES: [400, 'O sorteio precisa de pelo menos 3 participantes.'],
  LIMITE_SORTEIOS: [429, 'Este grupo já atingiu o limite de 5 sorteios.'],
  GRUPO_SO_LISTA: [400, 'Este grupo é só de lista. Mude o tipo para "Lista + sorteio" para sortear.'],
  GRUPO_NAO_ENCONTRADO: [404, 'Grupo não encontrado.']
};

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Método não permitido.' });

  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY, MAIL_FROM, APP_URL } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !RESEND_API_KEY || !MAIL_FROM || !APP_URL) {
    return res.status(500).json({ ok: false, error: 'Servidor sem configuração. Avise o administrador.' });
  }

  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const body = typeof req.body === 'string' ? safeJson(req.body) : (req.body || {});
  const groupId = String(body.groupId || '');
  if (!token) return res.status(401).json({ ok: false, error: 'Entre com seu e-mail para sortear.' });
  if (!/^[a-z0-9]{6,12}$/.test(groupId)) return res.status(400).json({ ok: false, error: 'Grupo inválido.' });

  // 1) Quem está chamando?
  const userResp = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${token}` }
  });
  if (!userResp.ok) return res.status(401).json({ ok: false, error: 'Sua sessão expirou. Entre de novo.' });
  const user = await userResp.json();

  // 2) Sorteio no banco (transação única dentro da função)
  const drawResp = await fetch(`${SUPABASE_URL}/rest/v1/rpc/draw_group`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ p_id: groupId, p_user: user.id })
  });
  const drawData = await drawResp.json().catch(() => null);
  if (!drawResp.ok) {
    const code = Object.keys(ERRORS).find(k => String(drawData && drawData.message).includes(k));
    const [status, msg] = code ? ERRORS[code] : [500, 'Não foi possível fazer o sorteio agora. Tente de novo.'];
    return res.status(status).json({ ok: false, error: msg });
  }

  // 3) Nome do grupo para o e-mail
  const groupResp = await fetch(`${SUPABASE_URL}/rest/v1/groups?id=eq.${groupId}&select=name,event_date,budget,place`, {
    headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` }
  });
  const group = ((await groupResp.json().catch(() => [])) || [])[0] || { name: 'Amigo Secreto' };
  const link = `${APP_URL.replace(/\/$/, '')}/amigo-secreto/g/${groupId}`;

  const emails = drawData.map(row => ({
    from: MAIL_FROM,
    to: [row.giver_email],
    subject: `Seu amigo secreto em "${group.name}"`,
    html: emailHtml({ giver: row.giver_name, receiver: row.receiver_name, group, link }),
    text: `Olá, ${row.giver_name}! Seu amigo secreto em "${group.name}" é: ${row.receiver_name}. ` +
          `Veja a lista de desejos: ${link}`
  }));

  // Resend aceita até 100 e-mails por chamada em lote
  let sent = 0, failed = 0;
  for (let i = 0; i < emails.length; i += 100) {
    const r = await fetch('https://api.resend.com/emails/batch', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(emails.slice(i, i + 100))
    });
    if (r.ok) sent += Math.min(100, emails.length - i); else failed += Math.min(100, emails.length - i);
  }

  if (sent) {
    await fetch(`${SUPABASE_URL}/rest/v1/rpc/mark_emailed`, {
      method: 'POST',
      headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_id: groupId })
    }).catch(() => {});
  }

  return res.status(200).json({ ok: true, participants: emails.length, emailsSent: sent, emailsFailed: failed });
};

function safeJson(s) { try { return JSON.parse(s); } catch (e) { return {}; } }

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function fmtDate(d) {
  if (!d) return '';
  const [y, m, day] = String(d).split('-');
  return `${day}/${m}/${y}`;
}

function emailHtml({ giver, receiver, group, link }) {
  const facts = [
    group.event_date ? `<b>Troca:</b> ${esc(fmtDate(group.event_date))}` : '',
    group.budget ? `<b>Valor sugerido:</b> ${esc(group.budget)}` : '',
    group.place ? `<b>Local:</b> ${esc(group.place)}` : ''
  ].filter(Boolean).join('<br>');
  return `<!doctype html><html lang="pt-BR"><body style="margin:0;background:#F2F5F1;font-family:Arial,Helvetica,sans-serif;color:#16261E">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px"><tr><td align="center">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#FFFFFF;border-radius:14px;padding:32px">
    <tr><td style="font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#56685D">${esc(group.name)}</td></tr>
    <tr><td style="padding-top:12px;font-size:18px">Olá, ${esc(giver)}! O sorteio foi feito.</td></tr>
    <tr><td style="padding-top:20px;font-size:15px;color:#56685D">Seu amigo secreto é</td></tr>
    <tr><td style="padding-top:6px;font-size:34px;font-weight:bold;color:#B8304A">${esc(receiver)}</td></tr>
    ${facts ? `<tr><td style="padding-top:20px;font-size:14px;line-height:1.6;color:#16261E">${facts}</td></tr>` : ''}
    <tr><td style="padding-top:28px"><a href="${esc(link)}" style="display:inline-block;background:#1E4C38;color:#F2F5F1;text-decoration:none;font-weight:bold;padding:12px 22px;border-radius:8px">Ver a lista de desejos</a></td></tr>
    <tr><td style="padding-top:24px;font-size:12px;color:#56685D">Guarde segredo! Só você recebeu este nome.</td></tr>
  </table></td></tr></table></body></html>`;
}
