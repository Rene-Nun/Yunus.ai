import { Client } from “@notionhq/client”;

const notion = new Client({ auth: process.env.NOTION_API_KEY });
const DATABASE_ID = process.env.NOTION_COMPRAS_DATABASE_ID;

export default async function handler(req, res) {
if (req.method !== “GET”) return res.status(405).end();

res.setHeader(“Cache-Control”, “no-store”);

const search = await notion.databases.query({
database_id: DATABASE_ID,
filter: {
property: “Estado”,
select: { equals: “En Reventa” }
}
});

const boletos = search.results.map(page => ({
id: page.id,
evento: page.properties.Evento?.select?.name || null,
zona: page.properties.Zona?.rich_text[0]?.plain_text || null,
fechaEvento: page.properties.FechaEvento?.date?.start || null,
precioReventa: page.properties.PrecioTotal?.number || null,
imagenEvento: page.properties.ImagenEvento?.rich_text[0]?.plain_text || null,
}));

res.status(200).json({ boletos });
}