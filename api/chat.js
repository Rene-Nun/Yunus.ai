import Groq from "groq-sdk";
import { Client } from "@notionhq/client";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const notion = new Client({ auth: process.env.NOTION_API_KEY });
const DATABASE_ID = process.env.NOTION_DATABASE_ID;

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const { mensaje, celular } = req.body;

  // Buscar usuario en Notion
  const search = await notion.databases.query({
    database_id: DATABASE_ID,
    filter: {
      property: "Teléfono",
      title: { equals: celular }
    }
  });

  if (search.results.length === 0) {
    return res.status(404).json({ error: "Usuario no encontrado" });
  }

  const page = search.results[0];
  const pageId = page.id;
  const nombre = page.properties.Nombre?.rich_text[0]?.plain_text || "Usuario";
  const etapa = page.properties.Etapa?.rich_text[0]?.plain_text || "bienvenida";

  // Llamar a Groq
  const completion = await groq.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    messages: [
      {
        role: "system",
        content: `Eres Yunus, agente financiero de Yunusia. Financias boletos en quincenas sin buro ni banco. Usuario: ${nombre}. INSTRUCCIONES: Si etapa es 'bienvenida': saluda por nombre con energia y pregunta que evento quiere financiar. Si etapa es 'ask_evento': NO saludes. El usuario ya eligio su evento. Confirma brevemente el evento mencionado y pide su INE como foto. Si etapa es 'documentos': NO saludes. Confirma que recibiste el INE. Pide comprobante de nomina opcional. Di que escriba LISTO para continuar. Si etapa es 'listo': NO saludes. Di que su solicitud esta siendo evaluada y que pronto le damos su resultado. ETAPA ACTUAL: ${etapa}`
      },
      {
        role: "user",
        content: mensaje
      }
    ],
    max_tokens: 800,
    temperature: 0.3
  });

  const respuesta = completion.choices[0].message.content;

  // Actualizar etapa en Notion
  let nuevaEtapa = etapa;
  if (mensaje.toUpperCase().includes("LISTO")) {
    nuevaEtapa = "listo";
  } else if (etapa === "bienvenida") {
    nuevaEtapa = "ask_evento";
  } else if (etapa === "ask_evento") {
    nuevaEtapa = "documentos";
  }

  await notion.pages.update({
    page_id: pageId,
    properties: {
      Etapa: {
        rich_text: [{ text: { content: nuevaEtapa } }]
      }
    }
  });

  res.status(200).json({ respuesta });
}