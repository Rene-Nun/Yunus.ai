import { Client } from "@notionhq/client";

const notion = new Client({ auth: process.env.NOTION_API_KEY });
const DATABASE_ID = process.env.NOTION_DATABASE_ID;

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).end();

  const { celular, Nombre_completo, Edad } = req.body;

  if (!celular || !Nombre_completo) {
    return res.status(400).json({ error: "Faltan datos requeridos" });
  }

  const digits10 = celular.replace(/\D/g, "").slice(-10);
  const telefonoNotion = `+52${digits10}`;

  const existing = await notion.databases.query({
    database_id: DATABASE_ID,
    filter: { property: "Teléfono", title: { equals: telefonoNotion } }
  });

  if (existing.results.length > 0) {
    return res.status(409).json({ error: "Este número ya está registrado" });
  }

  await notion.pages.create({
    parent: { database_id: DATABASE_ID },
    properties: {
      "Teléfono": { title: [{ text: { content: telefonoNotion } }] },
      "Nombre": { rich_text: [{ text: { content: Nombre_completo } }] },
      "Edad": { number: parseInt(Edad) || 0 }
    }
  });

  return res.status(200).json({ ok: true });
}