/**
 * GET /api/keepalive — chamado 1x por dia pelo Cron da Vercel (vercel.json).
 * Faz uma leitura mínima no Supabase para o projeto gratuito não ser pausado
 * por inatividade (o plano grátis pausa após 1 semana sem uso).
 */
module.exports = async (req, res) => {
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, CRON_SECRET } = process.env;
  // A Vercel envia "Authorization: Bearer <CRON_SECRET>" quando a variável existe
  if (CRON_SECRET && req.headers.authorization !== `Bearer ${CRON_SECRET}`) {
    return res.status(401).json({ ok: false });
  }
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return res.status(500).json({ ok: false });
  const r = await fetch(`${SUPABASE_URL}/rest/v1/groups?select=id&limit=1`, {
    headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` }
  });
  return res.status(r.ok ? 200 : 502).json({ ok: r.ok });
};
