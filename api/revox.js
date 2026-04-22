import { Client } from "@notionhq/client";

const notion = new Client({ auth: process.env.NOTION_API_KEY });
const USERS_DATABASE_ID = process.env.NOTION_DATABASE_ID;
const INVERSORES_DATABASE_ID = process.env.NOTION_INVERSORES_DATABASE_ID;

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).end();
  
  res.setHeader("Cache-Control", "no-store");
  
  const celular = req.query.celular;
  if (!celular) return res.status(400).json({ error: "Falta celular" });

  const digits = celular.replace(/\D/g, '').slice(-10);
  const celularNotion = `whatsapp:+521${digits}`;

  try {
    // 1. Validar que existe en Yunus
    const searchUser = await notion.databases.query({
      database_id: USERS_DATABASE_ID,
      filter: {
        property: "Teléfono",
        title: { equals: celularNotion }
      }
    });

    if (searchUser.results.length === 0) {
      return res.status(404).json({ error: "Usuario no encontrado" });
    }

    const nombreUsuario = searchUser.results[0].properties.Nombre?.rich_text[0]?.plain_text || "Inversor";

    // 2. Buscar en Revox
    const searchInversor = await notion.databases.query({
      database_id: INVERSORES_DATABASE_ID,
      filter: {
        property: "Celular",
        title: { equals: celularNotion }
      }
    });

    let inversorData = null;
    if (searchInversor.results.length > 0) {
      const page = searchInversor.results[0];
      inversorData = {
        capitalTotal: page.properties['Capital Total']?.number || 0,
        capitalDisponible: page.properties['Capital Disponible']?.number || 0,
        capitalEnUso: page.properties['Capital en Uso']?.number || 0,
        rendimientos: page.properties['Rendimientos Acumulados']?.number || 0,
        tasa: page.properties['Tasa Anual']?.number || 18,
        estado: page.properties.Estado?.select?.name || 'En onboarding',
        fechaIngreso: page.properties['Fecha de Ingreso']?.date?.start || null,
      };
    }

    res.status(200).json({
      nombre: nombreUsuario,
      esInversor: inversorData !== null,
      inversor: inversorData
    });

  } catch (error) {
    console.error("Error en API Revox:", error);
    res.status(500).json({ error: "Error interno del servidor" });
  }
}