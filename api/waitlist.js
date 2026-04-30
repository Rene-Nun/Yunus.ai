import { Client } from “@notionhq/client”;

const notion = new Client({ auth: process.env.NOTION_API_KEY });
const WAITLIST_DB = process.env.NOTION_WAITLIST_DATABASE_ID;

export default async function handler(req, res) {
res.setHeader(“Access-Control-Allow-Origin”, “*”);
res.setHeader(“Access-Control-Allow-Methods”, “POST, OPTIONS”);
res.setHeader(“Access-Control-Allow-Headers”, “Content-Type”);

if (req.method === “OPTIONS”) return res.status(200).end();
if (req.method !== “POST”) return res.status(405).end();

const { celular } = req.body;
if (!celular) return res.status(400).json({ error: “Falta celular” });

// Normalizar: asegurar que tenga +52
const celularNorm = celular.startsWith(”+52”) ? celular : “+52” + celular.replace(/\D/g, “”).slice(-10);

// Verificar si ya existe
const existing = await notion.databases.query({
database_id: WAITLIST_DB,
filter: { property: “Celular”, title: { equals: celularNorm } }
});

if (existing.results.length > 0) {
return res.status(200).json({ ok: true, nuevo: false, mensaje: “Ya estás en la lista” });
}

// Crear entrada
await notion.pages.create({
parent: { database_id: WAITLIST_DB },
properties: {
Celular: { title: [{ text: { content: celularNorm } }] },
Codigo: { rich_text: [] },
Usado: { checkbox: false }
}
});

return res.status(200).json({ ok: true, nuevo: true });
}