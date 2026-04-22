import { Client } from "@notionhq/client";

const notion = new Client({ auth: process.env.NOTION_API_KEY });
const COMPRAS_DATABASE_ID = process.env.NOTION_COMPRAS_DATABASE_ID;
const USERS_DATABASE_ID = process.env.NOTION_DATABASE_ID; // ← La base de usuarios que usas en el chat

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).end();

  res.setHeader("Cache-Control", "no-store");

  const celular = req.query.celular;
  if (!celular) return res.status(400).json({ error: "Falta celular" });

  const digits = celular.replace(/\D/g, '').slice(-10);
  const celularFormato = digits;

  try {
    // 1. Buscar las compras (Tu código original intacto)
    const searchCompras = await notion.databases.query({
      database_id: COMPRAS_DATABASE_ID,
      filter: {
        property: "Celular",
        title: { contains: celularFormato }
      }
    });

    const compras = searchCompras.results.map(page => ({
      id: page.id,
      evento: page.properties.Evento?.select?.name || null,
      zona: page.properties.Zona?.rich_text[0]?.plain_text || null,
      fechaEvento: page.properties.FechaEvento?.date?.start || null,
      precioTotal: page.properties.PrecioTotal?.number || null,
      enganche: page.properties.Enganche?.number || null,
      cuotaQuincenal: page.properties.CuotaQuincenal?.number || null,
      totalCuotas: page.properties.TotalCuotas?.number || null,
      cuotasPagadas: page.properties.CuotasPagadas?.number || null,
      proximoPago: page.properties.ProximoPago?.date?.start || null,
      estado: page.properties.Estado?.select?.name || null,
      imagenEvento: page.properties.ImagenEvento?.rich_text[0]?.plain_text || null,
    }));

    // 2. Buscar el nombre del usuario en la base principal
    let nombreUsuario = celular; // Fallback por si no lo encuentra
    
    try {
      const celularNotion = `whatsapp:+521${digits}`; // Formato exacto que usa tu Chat API
      const searchUser = await notion.databases.query({
        database_id: USERS_DATABASE_ID,
        filter: {
          property: "Teléfono",
          title: { equals: celularNotion }
        }
      });

      if (searchUser.results.length > 0) {
        // Extraemos el nombre igual que en tu chat
        const nombreEncontrado = searchUser.results[0].properties.Nombre?.rich_text[0]?.plain_text;
        if (nombreEncontrado) {
          nombreUsuario = nombreEncontrado;
        }
      }
    } catch (userError) {
      console.error("Error buscando el nombre del usuario, usando celular como fallback", userError);
    }

    // 3. Devolver ambas cosas al frontend
    res.status(200).json({ compras: compras, nombre: nombreUsuario });

  } catch (error) {
    console.error("Error en API Boveda:", error);
    res.status(500).json({ error: "Error interno del servidor" });
  }
}