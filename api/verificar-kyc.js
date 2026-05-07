import { Client } from "@notionhq/client";

const notion = new Client({ auth: process.env.NOTION_API_KEY });
const USERS_DATABASE_ID = process.env.NOTION_DATABASE_ID;

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).end();

  // Bloqueamos el caché de Vercel para que siempre consulte la versión más reciente en Notion
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");

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
      
      // Verificamos si las propiedades "INE frente" e "INE reverso" tienen contenido
      const tieneINE = user.properties["INE frente"]?.rich_text?.length > 0 && 
                       user.properties["INE reverso"]?.rich_text?.length > 0;
      
      // Obtenemos la CLABE si existe
      const clabeGuardada = user.properties["CLABE"]?.rich_text[0]?.text?.content || null;
      
      return res.status(200).json({ 
        kycCompletado: tieneINE, 
        clabeExistente: clabeGuardada 
      });
    }

    return res.status(200).json({ kycCompletado: false, clabeExistente: null });
  } catch (error) {
    return res.status(500).json({ error: "Error verificando usuario" });
  }
}