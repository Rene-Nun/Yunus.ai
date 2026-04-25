import { Client } from "@notionhq/client";

const notion = new Client({ auth: process.env.NOTION_API_KEY });
const DATABASE_ID = process.env.NOTION_DATABASE_ID;

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).end();

  res.setHeader("Cache-Control", "no-store");

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
  const raw = page.properties.Historial?.rich_text[0]?.plain_text || "";
  const etapa = page.properties.Etapa?.rich_text[0]?.plain_text || "bienvenida";

  const historial = [];

  // Partir por líneas y reconstruir bloques
  const lineas = raw.split('\n');
  let bloqueActual = '';

  for (const linea of lineas) {
    const esTimestamp = /^\[\d{1,2}\/\d{1,2}\/\d{4},\s*\d/.test(linea);
    if (esTimestamp && bloqueActual) {
      procesarBloque(bloqueActual.trim(), historial);
      bloqueActual = linea;
    } else {
      bloqueActual += '\n' + linea;
    }
  }
  if (bloqueActual.trim()) procesarBloque(bloqueActual.trim(), historial);

  res.status(200).json({ historial, etapa });
}

function procesarBloque(bloque, historial) {
  // Extraer todo el contenido después de "] Usuario:" o "] Yunus:" o "\nUsuario:" o "\nYunus:"
  const usuarioMatch = bloque.match(/\] Usuario:\s*([\s\S]+)/) || bloque.match(/\nUsuario:\s*([\s\S]+)/);
  const yunusMatch = bloque.match(/\] Yunus:\s*([\s\S]+)/) || bloque.match(/\nYunus:\s*([\s\S]+)/);

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