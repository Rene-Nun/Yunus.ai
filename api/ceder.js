import { Client } from "@notionhq/client";
import { v2 as cloudinary } from "cloudinary";

const notion = new Client({ auth: process.env.NOTION_API_KEY });
const COMPRAS_DATABASE_ID = process.env.NOTION_COMPRAS_DATABASE_ID;
const USERS_DATABASE_ID   = process.env.NOTION_DATABASE_ID;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Sube una imagen base64 a Cloudinary y devuelve la URL
async function subirCloudinary(base64, folder) {
  try {
    const result = await cloudinary.uploader.upload(base64, {
      folder: folder,
      resource_type: "image"
    });
    return result.secure_url;
  } catch (error) {
    throw new Error("Cloudinary error: " + JSON.stringify(error));
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const {
    celular,
    evento,
    fechaEvento,
    zona,
    precioCedente,
    precioListado,
    clabe,
    screenshot,
    ineFrente,
    ineReverso,
    selfie
  } = req.body;

  // Validacion basica
  if (!celular || !evento || !fechaEvento || !zona || !precioCedente || !precioListado) {
    return res.status(400).json({ error: "Faltan datos del boleto." });
  }
  if (!clabe || !ineFrente || !ineReverso || !selfie) {
    return res.status(400).json({ error: "Faltan datos de verificacion." });
  }

  const digits = celular.replace(/\D/g, "").slice(-10);

  try {
    // 1. Subir imagenes a Cloudinary
    const folder          = `yunus/cedentes/${digits}`;
    const screenshotUrl   = screenshot ? await subirCloudinary(screenshot,  folder) : null;
    const ineFrenteUrl    = await subirCloudinary(ineFrente,  folder);
    const ineReversoUrl   = await subirCloudinary(ineReverso, folder);
    const selfieUrl       = await subirCloudinary(selfie,     folder);

    // 2. Crear registro en BD Compras Yunus
    await notion.pages.create({
      parent: { database_id: COMPRAS_DATABASE_ID },
      properties: {
        // Celular como titulo (igual que el resto de registros)
        "Celular": {
          title: [{ text: { content: digits } }]
        },
        "Tipo": {
          select: { name: "Cesion" }
        },
        "Estado": {
          select: { name: "En Revision" }
        },
        "Evento": {
          select: { name: evento }
        },
        "Zona": {
          rich_text: [{ text: { content: zona } }]
        },
        "FechaEvento": {
          date: { start: fechaEvento }
        },
        "PrecioCedente": {
          number: Number(precioCedente)
        },
        "PrecioListado": {
          number: Number(precioListado)
        },
        ...(screenshotUrl && {
          "ComprobanteCompra": {
            url: screenshotUrl
          }
        })
      }
    });

    // 3. Buscar si el usuario ya existe en BD Usuarios
    const celularNotion = "whatsapp:+521" + digits;
    const searchUser = await notion.databases.query({
      database_id: USERS_DATABASE_ID,
      filter: {
        property: "Telefono",
        title: { equals: celularNotion }
      }
    });

    const kycProps = {
      "CLABE": {
        rich_text: [{ text: { content: clabe } }]
      },
      "INE Frente": {
        rich_text: [{ text: { content: ineFrenteUrl } }]
      },
      "INE Reverso": {
        rich_text: [{ text: { content: ineReversoUrl } }]
      },
      "Selfie": {
        rich_text: [{ text: { content: selfieUrl } }]
      }
    };

    if (searchUser.results.length > 0) {
      // Actualizar registro existente con KYC + CLABE
      await notion.pages.update({
        page_id: searchUser.results[0].id,
        properties: kycProps
      });
    } else {
      // Crear registro nuevo en BD Usuarios
      await notion.pages.create({
        parent: { database_id: USERS_DATABASE_ID },
        properties: {
          "Telefono": {
            title: [{ text: { content: celularNotion } }]
          },
          ...kycProps
        }
      });
    }

    return res.status(200).json({ ok: true });

  } catch (error) {
    console.error("Error en api/ceder:", error);
    return res.status(500).json({ error: "Error interno. Intenta de nuevo." });
  }
}