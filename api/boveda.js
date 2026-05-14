import { Client } from "@notionhq/client";

const notion = new Client({ auth: process.env.NOTION_API_KEY });
const COMPRAS_DATABASE_ID = process.env.NOTION_COMPRAS_DATABASE_ID;
const USERS_DATABASE_ID   = process.env.NOTION_DATABASE_ID;

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).end();
  res.setHeader("Cache-Control", "no-store");

  const celular = req.query.celular;
  if (!celular) return res.status(400).json({ error: "Falta celular" });

  const digits = celular.replace(/\D/g, "").slice(-10);
  const celularNormalizado = "+52" + digits;

  try {
    const searchCompras = await notion.databases.query({
      database_id: COMPRAS_DATABASE_ID,
      filter: {
        property: "Celular",
        title: { contains: digits }
      }
    });

    const todos = searchCompras.results.map(page => ({
      id:                   page.id,
      tipo:                 page.properties.Tipo?.rich_text[0]?.plain_text || "Compra",
      evento:               page.properties.Evento?.select?.name || null,
      zona:                 page.properties.Zona?.rich_text[0]?.plain_text || null,
      fechaEvento:          page.properties.FechaEvento?.date?.start || null,
      estado:               page.properties.Estado?.select?.name || null,
      cantidad:             page.properties.Cantidad?.number || 1,

      // Compra
      precioTotal:          page.properties.PrecioTotal?.number || null,
      enganche:             page.properties.Enganche?.number || null,
      cuotaQuincenal:       page.properties.CuotaQuincenal?.number || null,
      totalCuotas:          page.properties.TotalCuotas?.number || null,
      cuotasPagadas:        page.properties.CuotasPagadas?.number || 0,
      proximoPago:          page.properties.ProximoPago?.date?.start || null,
      fechaEntregaBoleto:   page.properties.FechaEntregaBoleto?.date?.start || null,

      // Cesión
      precioListado:        page.properties.PrecioListado?.number || null,
      precioCedente:        page.properties.PrecioCedente?.number || null,
      fechaDeposito:        page.properties.FechaDeposito?.date?.start || null,
    }));

    const compras = todos.filter(r => r.tipo !== "Cesión");
    const cedidos = todos.filter(r => r.tipo === "Cesión");

    // Nombre del usuario
    let nombreUsuario = celularNormalizado;
    try {
      const searchUser = await notion.databases.query({
        database_id: USERS_DATABASE_ID,
        filter: {
          property: "Teléfono",
          title: { equals: celularNormalizado }
        }
      });
      if (searchUser.results.length > 0) {
        const encontrado = searchUser.results[0].properties.Nombre?.rich_text[0]?.plain_text;
        if (encontrado) nombreUsuario = encontrado;
      }
    } catch (e) {
      console.error("Error buscando nombre:", e);
    }

    res.status(200).json({ compras, cedidos, nombre: nombreUsuario });

  } catch (error) {
    console.error("Error en API Bóveda:", error);
    res.status(500).json({ error: "Error interno del servidor" });
  }
}