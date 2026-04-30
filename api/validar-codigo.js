import { Client } from "@notionhq/client";

const notion = new Client({ auth: process.env.NOTION_API_KEY });
const WAITLIST_DB = process.env.NOTION_WAITLIST_DATABASE_ID;

export default async function handler(req, res) {
res.setHeader("Access-Control-Allow-Origin", "*");
res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
res.setHeader("Access-Control-Allow-Headers", "Content-Type");

if (req.method === "OPTIONS") return res.status(200).end();
if (req.method !== "POST") return res.status(405).end();

const { codigo } = req.body;
if (!codigo) return res.status(400).json({ error: "Falta código" });

const codigoUpper = codigo.trim().toUpperCase();

// Buscar el código en Waitlist
const search = await notion.databases.query({
database_id: WAITLIST_DB,
filter: {
property: "Codigo",
rich_text: { equals: codigoUpper }
}
});

if (search.results.length === 0) {
return res.status(404).json({ error: "Código no válido" });
}

const page = search.results[0];
const usado = page.properties.Usado?.checkbox;

if (usado) {
return res.status(409).json({ error: "Este código ya fue usado" });
}

// Obtener el celular asociado
const celular = page.properties.Celular?.title?.[0]?.plain_text || "";

// Marcar como usado
await notion.pages.update({
page_id: page.id,
properties: {
Usado: { checkbox: true }
}
});

return res.status(200).json({ ok: true, celular });
}