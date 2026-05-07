import { Client } from "@notionhq/client";

const notion = new Client({ auth: process.env.NOTION_API_KEY });
const USERS_DATABASE_ID = process.env.NOTION_DATABASE_ID;

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).end();

  const { celular } = req.query;
  if (!celular) return res.status(400).json({ error: "Falta celular" });

  const digits = celular.replace(/\D/g, "").slice(-10);
  const celularNotion = "whatsapp:+521" + digits;

  try {
    const searchUser = await notion.databases.query({
      database_id: USERS_DATABASE_ID,
      filter: {
        property: "Teléfono",
        title: { equals: celularNotion }
      }
    });

    if (searchUser.results.length > 0) {
      const user = searchUser.results[0];
      // Verificamos si la propiedad "INE Frente" tiene contenido
      const tieneINE = user.properties["INE Frente"]?.rich_text?.length > 0;
      
      return res.status(200).json({ kycCompletado: tieneINE });
    }

    return res.status(200).json({ kycCompletado: false });
  } catch (error) {
    return res.status(500).json({ error: "Error verificando usuario" });
  }
}