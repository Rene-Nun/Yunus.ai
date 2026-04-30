import { Client } from "@notionhq/client";

const notion = new Client({ auth: process.env.NOTION_API_KEY });
const DATABASE_ID = process.env.NOTION_DATABASE_ID;

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).end();

  const {
    celular,
    Nombre_completo,
    Edad,
    Entidad_federativa,
    Codigo_postal,
    Ingreso_mensual,
    Marca_celular,
    Gastos_celular,
    Gastos_vivienda,
    Gastos_automovil,
    Dependientes,
    Historial_crediticio,
    Otras_deudas
  } = req.body;

  if (!celular || !Nombre_completo) {
    return res.status(400).json({ error: "Faltan datos requeridos" });
  }

  // Extraer solo los 10 dígitos del número sin importar cómo llegue
  const digits10 = celular.replace(/\D/g, "").slice(-10);
  const telefonoNotion = `whatsapp:+521${digits10}`;

  // Verificar si ya existe en BD principal
  const existing = await notion.databases.query({
    database_id: DATABASE_ID,
    filter: { property: "Telefono", title: { equals: telefonoNotion } }
  });
  // telefonoNotion = "whatsapp:+521XXXXXXXXXX" — formato exacto de la BD

  if (existing.results.length > 0) {
    return res.status(409).json({ error: "Este número ya está registrado" });
  }

  // Crear usuario en BD principal
  await notion.pages.create({
    parent: { database_id: DATABASE_ID },
    properties: {
      "Telefono": { title: [{ text: { content: telefonoNotion } }] },
      "Nombre": { rich_text: [{ text: { content: Nombre_completo } }] },
      "Edad": { number: parseInt(Edad) || 0 },
      "Entidad_federativa": { rich_text: [{ text: { content: Entidad_federativa || "" } }] },
      "Codigo_postal": { rich_text: [{ text: { content: Codigo_postal || "" } }] },
      "Ingreso_mensual": { number: parseInt(Ingreso_mensual) || 0 },
      "Marca_celular": { rich_text: [{ text: { content: Marca_celular || "" } }] },
      "Gastos_celular": { rich_text: [{ text: { content: Gastos_celular || "" } }] },
      "Gastos_vivienda": { rich_text: [{ text: { content: Gastos_vivienda || "" } }] },
      "Gastos_automovil": { rich_text: [{ text: { content: Gastos_automovil || "" } }] },
      "Dependientes": { number: parseInt(Dependientes) || 0 },
      "Historial_crediticio": { rich_text: [{ text: { content: Historial_crediticio || "" } }] },
      "Otras_deudas": { rich_text: [{ text: { content: Otras_deudas || "" } }] },
      "Etapa": { rich_text: [{ text: { content: "bienvenida" } }] }
    }
  });

  return res.status(200).json({ ok: true });
}