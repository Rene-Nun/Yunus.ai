=import { Client } from "@notionhq/client";

const notion = new Client({ auth: process.env.NOTION_API_KEY });
const COMPRAS_DB = process.env.NOTION_COMPRAS_DATABASE_ID;

const rateLimit = new Map();
function checkRateLimit(ip) {
  const now = Date.now();
  const entry = rateLimit.get(ip);
  if (!entry || now - entry.start > 60000) {
    rateLimit.set(ip, { count: 1, start: now }); return true;
  }
  if (entry.count >= 20) return false;
  entry.count++; return true;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || "unknown";
  if (!checkRateLimit(ip))
    return res.status(429).json({ error: "Demasiadas solicitudes. Espera un momento." });

  const {
    celular, nombre, evento, zona,
    fechaEvento, precioTotal, enganche,
    totalCuotas, cuotaQuincenal, cantidad
  } = req.body;

  if (!celular || !evento || !precioTotal) {
    return res.status(400).json({ error: "Faltan datos de la compra." });
  }

  const cantidadFinal = Math.min(Math.max(parseInt(cantidad) || 1, 1), 3);

  try {
    await notion.pages.create({
      parent: { database_id: COMPRAS_DB },
      properties: {
        "Celular":          { title: [{ text: { content: nombre || celular } }] },
        "Evento":          { select: { name: evento } },
        "Zona":            { rich_text: [{ text: { content: zona || "" } }] },
        "FechaEvento":     { date: fechaEvento ? { start: fechaEvento } : null },
        "PrecioTotal":     { number: parseFloat(precioTotal) },
        "Enganche":        { number: parseFloat(enganche) },
        "TotalCuotas":     { number: parseInt(totalCuotas) },
        "CuotaQuincenal":  { number: parseFloat(cuotaQuincenal) },
        "CuotasPagadas":   { number: 0 },
        "Estado":          { select: { name: "Pendiente" } },
        "Tipo":            { select: { name: "Compra" } },
        "NotasInternas":    { rich_text: [{ text: { content: `Celular: ${celular} · Cantidad: ${cantidadFinal}` } }] }
      }
    });

    res.status(200).json({ success: true });
  } catch (error) {
    console.error("Error en checkout:", error);
    res.status(500).json({ error: "Error al registrar la compra." });
  }
}