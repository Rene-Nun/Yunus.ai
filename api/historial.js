import { Client } from "@notionhq/client";

const notion = new Client({ auth: process.env.NOTION_API_KEY });
const DATABASE_ID = process.env.NOTION_DATABASE_ID;

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).end();

  // 1. Destruimos el caché de Vercel con fuerza bruta
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");

  const celular = req.query.celular;
  if (!celular) return res.status(400).json({ error: "Falta celular" });

  const celularNotion = `whatsapp:+521${celular.replace('+52', '')}`;

  const search = await notion.databases.query({
    database_id: DATABASE_ID,
    filter: {
      property: "Teléfono",
      title: { equals: celularNotion }
    }
  });

  if (search.results.length === 0) {
    return res.status(404).json({ error: "Usuario no encontrado" });
  }

  const page = search.results[0];
  
  // 2. Extraemos la Etapa para avisarle al frontend y bloquear el chat
  const etapa = page.properties.Etapa?.rich_text[0]?.plain_text || "bienvenida";

  // 3. Leemos TODO el texto sin límite de 2000 caracteres
  const raw = page.properties.Historial?.rich_text?.map(rt => rt.plain_text).join("") || "";

  const historial = [];
  const entradas = raw.split(/(?=\[\d+\/\d+\/\d+,)/);

  for (const entrada of entradas) {
    if (!entrada.trim()) continue;

    const usuarioMatch = entrada.match(/\] Usuario: ([\s\S]+)/);
    const yunusMatch = entrada.match(/\] Yunus: ([\s\S]+)/);

    if (usuarioMatch) {
      const contenido = usuarioMatch[1].trim();
      const imagenMatch = contenido.match(/^\[imagen: (.+)\]$/);
      if (imagenMatch) {
        historial.push({ tipo: 'usuario', texto: imagenMatch[1], esImagen: true });
      } else {
        historial.push({ tipo: 'usuario', texto: contenido, esImagen: false });
      }
    } else if (yunusMatch) {
      historial.push({ tipo: 'yunus', texto: yunusMatch[1].trim(), esImagen: false });
    }
  }

  // Ahora sí enviamos la "etapa" para que tu chat.html accione la luz verde
  res.status(200).json({ historial, etapa });
}