import { Client } from "@notionhq/client";
import { v2 as cloudinary } from "cloudinary";

const notion = new Client({ auth: process.env.NOTION_API_KEY });
const DATABASE_ID = process.env.NOTION_DATABASE_ID;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Rate limiting básico para proteger el endpoint
const rateLimit = new Map();

function checkRateLimit(ip) {
  const now = Date.now();
  const windowMs = 60 * 1000;
  const max = 20;
  if (!rateLimit.has(ip)) {
    rateLimit.set(ip, { count: 1, start: now });
    return true;
  }
  const entry = rateLimit.get(ip);
  if (now - entry.start > windowMs) {
    rateLimit.set(ip, { count: 1, start: now });
    return true;
  }
  if (entry.count >= max) return false;
  entry.count++;
  return true;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || "unknown";
  if (!checkRateLimit(ip)) {
    return res.status(429).json({ error: "Demasiadas solicitudes. Espera un momento." });
  }

  const { celular, evento, zona, ineFrente, ineReverso, selfie } = req.body;

  // MODIFICACIÓN: Ya no exigimos las fotos obligatoriamente, solo el celular
  if (!celular) {
    return res.status(400).json({ error: "Falta el número de celular para completar la solicitud." });
  }

  try {
    // 1. Buscar al usuario en Notion por su número de teléfono
    const celularNotion = `whatsapp:+521${celular.replace('+52', '')}`;
    const search = await notion.databases.query({
      database_id: DATABASE_ID,
      filter: {
        property: "Teléfono",
        title: { equals: celularNotion }
      }
    });

    if (search.results.length === 0) {
      return res.status(404).json({ error: "Usuario no encontrado." });
    }

    const pageId = search.results[0].id;

    // 2. Subir las imágenes a Cloudinary en paralelo (Solo si vienen en la petición)
    const uploadOptions = { folder: `yunus/${celular}`, resource_type: "image" };
    
    const [uploadFrente, uploadReverso, uploadSelfie] = await Promise.all([
      ineFrente  ? cloudinary.uploader.upload(ineFrente, uploadOptions)  : Promise.resolve(null),
      ineReverso ? cloudinary.uploader.upload(ineReverso, uploadOptions) : Promise.resolve(null),
      selfie     ? cloudinary.uploader.upload(selfie, uploadOptions)     : Promise.resolve(null)
    ]);

    // 3. Generar la fecha en el formato ISO 8601 que requiere Notion
    const timestamp = new Date().toISOString();

    // 4. Construir las propiedades dinámicamente para no borrar las fotos existentes si no se mandaron
    const propiedadesActualizar = {
      "Evento interés": { rich_text: [{ text: { content: evento || "" } }] },
      "Zona/categoría": { rich_text: [{ text: { content: zona || "" } }] },
      "Fecha registro": { date: { start: timestamp } } // <--- ¡AQUÍ ESTÁ LA MAGIA!
    };

    if (uploadFrente)  propiedadesActualizar["INE frente"]  = { rich_text: [{ text: { content: uploadFrente.secure_url } }] };
    if (uploadReverso) propiedadesActualizar["INE reverso"] = { rich_text: [{ text: { content: uploadReverso.secure_url } }] };
    if (uploadSelfie)  propiedadesActualizar["Selfie"]      = { rich_text: [{ text: { content: uploadSelfie.secure_url } }] };

    // 5. Actualizar Notion
    await notion.pages.update({
      page_id: pageId,
      properties: propiedadesActualizar
    });

    // 6. Responder éxito al frontend
    res.status(200).json({ success: true });

  } catch (error) {
    console.error("Error en checkout:", error);
    res.status(500).json({ error: "Ocurrió un error al procesar tu solicitud." });
  }
}