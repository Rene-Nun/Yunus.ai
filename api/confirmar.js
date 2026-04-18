const PANEL_PASSWORD = process.env.PANEL_PASSWORD;
const MAKE_WEBHOOK = process.env.MAKE_CONFIRMAR_WEBHOOK;

export default async function handler(req, res) {
if (req.method !== “POST”) return res.status(405).end();

const { password, celular, documentos } = req.body;

// Validate password
if (!password || password !== PANEL_PASSWORD) {
return res.status(401).json({ error: “No autorizado” });
}

// Validate inputs
if (!/^[0-9]{10}$/.test(celular)) {
return res.status(400).json({ error: “Celular inválido” });
}

if (![“si”, “no”].includes(documentos)) {
return res.status(400).json({ error: “Valor de documentos inválido” });
}

// Forward to Make webhook
const makeRes = await fetch(MAKE_WEBHOOK, {
method: “POST”,
headers: { “Content-Type”: “application/json” },
body: JSON.stringify({
tipo: “confirmar_docs”,
celular,
documentos
})
});

if (!makeRes.ok) {
return res.status(502).json({ error: “Error al contactar Make” });
}

res.status(200).json({ ok: true });
}