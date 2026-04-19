import { Client } from "@notionhq/client";

const notion = new Client({ auth: process.env.NOTION_API_KEY });
const DATABASE_ID = process.env.NOTION_COMPRAS_DATABASE_ID;

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).end();

  res.setHeader("Cache-Control", "no-store");

  const celular = req.query.celular;
  if (!celular) return res.status(400).json({ error: "Falta celular" });

  const celularFormato = celular.startsWith('+52') ? celular : '+52' + celular;

  const search = await notion.databases.query({
    database_id: DATABASE_ID,
    filter: {
      property: "Celular",
      title: { contains: celularFormato }
    }
  });

  const compras = search.results.map(page => ({
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

  res.status(200).json({ compras });
}