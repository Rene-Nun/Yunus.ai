const PANEL_PASSWORD = process.env.PANEL_PASSWORD;
const MAKE_WEBHOOK = process.env.MAKE_CONFIRMAR_WEBHOOK;

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const { password, celular, documentos } = req.body;

  if (!password || password !== PANEL_PASSWORD) {
    return res.status(401).json({ error: "No autorizado" });
  }

  if (!/^[0-9]{10}$/.test(celular)) {
    return res.status(400).json({ error: "Celular invalido" });
  }

  if (documentos !== "si" && documentos !== "no") {
    return res.status(400).json({ error: "Valor invalido" });
  }

  const makeRes = await fetch(MAKE_WEBHOOK, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tipo: "confirmar_docs", celular, documentos })
  });

  if (!makeRes.ok) return res.status(502).json({ error: "Error Make" });

  res.status(200).json({ ok: true });
}