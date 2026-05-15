import { Client } from "@notionhq/client";
import { v2 as cloudinary } from "cloudinary";

const notion = new Client({ auth: process.env.NOTION_API_KEY });
const COMPRAS_DATABASE_ID = process.env.NOTION_COMPRAS_DATABASE_ID;
const USERS_DATABASE_ID   = process.env.NOTION_DATABASE_ID;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

async function subirCloudinary(base64, folder) {
  const result = await cloudinary.uploader.upload(base64, {
    folder, resource_type: "image"
  });
  return result.secure_url;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const {
    celular, evento, fechaEvento, zona,
    precioCedente, precioListado, clabe,
    cantidad, screenshot
  } = req.body;

  if (!celular || !evento || !fechaEvento || !zona || !precioCedente || !precioListado) {
    return res.status(400).json({ error: "Faltan datos del boleto." });
  }
  if (!clabe) {
    return res.status(400).json({ error: "Falta la CLABE interbancaria." });
  }

  const digits = celular.replace(/\D/g, "").slice(-10);
  const celularNormalizado = "+52" + digits;
  const cantidadFinal = Math.min(Math.max(parseInt(cantidad) || 1, 1), 3);

  try {
    // 1. Subir comprobante a Cloudinary (único archivo)
    const folder = `fandom/cedentes/${digits}`;
    const screenshotUrl = screenshot ? await subirCloudinary(screenshot, folder) : null;

    // 2. Crear registro en BD Compras
    await notion.pages.create({
      parent: { database_id: COMPRAS_DATABASE_ID },
      properties: {
        "Celular":        { title: [{ text: { content: celularNormalizado } }] },
        "Tipo":           { select: { name: "Cesión" } },
        "Estado":         { select: { name: "En Revision" } },
        "Evento":         { select: { name: evento } },
        "Zona":           { rich_text: [{ text: { content: zona } }] },
        "FechaEvento":    { date: { start: fechaEvento } },
        "PrecioCedente":  { number: Number(precioCedente) },
        "PrecioListado":  { number: Number(precioListado) },
        "Cantidad":       { number: cantidadFinal },
        ...(screenshotUrl && {
          "ComprobanteCompra": { url: screenshotUrl }
        })
      }
    });

    // 3. Guardar CLABE en BD Usuarios (crear o actualizar)
    const searchUser = await notion.databases.query({
      database_id: USERS_DATABASE_ID,
      filter: {
        property: "Teléfono",
        title: { equals: celularNormalizado }
      }
    });

    if (searchUser.results.length > 0) {
      await notion.pages.update({
        page_id: searchUser.results[0].id,
        properties: {
          "CLABE": { rich_text: [{ text: { content: clabe } }] }
        }
      });
    } else {
      await notion.pages.create({
        parent: { database_id: USERS_DATABASE_ID },
        properties: {
          "Teléfono": { title: [{ text: { content: celularNormalizado } }] },
          "CLABE":    { rich_text: [{ text: { content: clabe } }] }
        }
      });
    }

    return res.status(200).json({ ok: true });

  } catch (error) {
    console.error("Error en api/ceder:", error);
    return res.status(500).json({ error: "Error interno. Intenta de nuevo." });
  }
}