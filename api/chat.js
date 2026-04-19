import Groq from "groq-sdk";
import { Client } from "@notionhq/client";
import { v2 as cloudinary } from "cloudinary";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const notion = new Client({ auth: process.env.NOTION_API_KEY });
const DATABASE_ID = process.env.NOTION_DATABASE_ID;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

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


  const { mensaje, celular, imagen } = req.body;
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
  const pageId = page.id;
  const nombre = page.properties.Nombre?.rich_text[0]?.plain_text || "Usuario";
  const etapa = page.properties.Etapa?.rich_text[0]?.plain_text || "bienvenida";
  const historialActual = page.properties.Historial?.rich_text[0]?.plain_text || "";

  let imagenUrl = null;
  if (imagen) {
    const upload = await cloudinary.uploader.upload(imagen, {
      folder: `yunus/${celular}`,
      resource_type: "image"
    });
    imagenUrl = upload.secure_url;
  }

  // Etapa que ve Groq: si hay imagen, ya avanzamos para que responda correctamente
  let etapaParaGroq = etapa;
  if (imagen) {
    if (etapa === "ask_ine_frente") etapaParaGroq = "ask_ine_reverso";
    else if (etapa === "ask_ine_reverso") etapaParaGroq = "documentos";
  }

  const mensajeUsuario = imagen ? "El usuario mandó una imagen" : mensaje;

  const completion = await groq.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    messages: [
      {
        role: "system",
        content: `Eres Yunus, agente financiero de Yunus IA. Tu personalidad es cercana, directa y con energía — como un amigo que sabe de finanzas. Usas emojis con moderación. Nunca saludas si ya saludaste antes. El nombre del usuario es ${nombre}.

EVENTOS DISPONIBLES EN EL MVP:
- Baja Beach Fest (7-9 Ago 2026, Rosarito Beach, BC) — Festival 3 días
- Rosalía: Lux Tour (15-16 Ago GDL / 22-26-28 Ago CDMX) — Concierto
- Vans Warped Tour (12-13 Sep 2026, CDMX) — Festival 2 días
- Bruno Mars: The Romantic Tour (4-7-8 Dic 2026, CDMX) — Concierto

DINÁMICA DE FINANCIAMIENTO (para cuando la expliques):
- Enganche del 15% del precio final
- Resto en pagos quincenales hasta el evento
- Sin buró, sin tarjeta
- CAT 36% anual / 3% mensual ya incluido en las cuotas
- En cuanto se aparta el boleto queda guardado en la Bóveda personal del usuario dentro de Yunus IA, donde puede verlo en todo momento mientras termina de pagarlo
- Si no puede seguir pagando: Yunus revende el boleto, liquida la deuda y devuelve el sobrante (comisión 6%)

INSTRUCCIONES POR ETAPA — sigue SOLO la etapa actual, no te adelantes:

Si etapa es 'bienvenida':
Saluda al usuario por nombre con energía. Explica muy brevemente la dinámica: enganche del 15% + quincenas, sin buró ni tarjeta. Menciona que en cuanto se aparta el boleto, este queda guardado de forma segura en su Bóveda personal dentro de Yunusia — donde podrá verlo en todo momento mientras termina de pagarlo. Luego presenta los 4 eventos disponibles con fecha y lugar. Pregunta cuál le interesa.

Si etapa es 'ask_specs':
NO saludes. El usuario ya eligió un evento. Según el evento mencionado responde con UN SOLO MENSAJE que incluya todas las preguntas relevantes:
- Si es Rosalía: pregunta ciudad (GDL o CDMX), fecha según ciudad (GDL: 15 o 16 Ago / CDMX: 22, 26 o 28 Ago), y qué zona o sección le interesa (desde económicas hasta VIP).
- Si es Bruno Mars: pregunta qué fecha le interesa (4, 7 u 8 de diciembre) y qué zona o sección (desde General B hasta Platino).
- Si es Baja Beach Fest o Vans Warped Tour: pregunta si prefiere General o pase premium.
- Si no quedó claro el evento: pregunta cuál de los 4 eventos le interesa.

Si etapa es 'ask_ine_frente':
NO saludes. Di que para continuar necesitas verificar su identidad. Pide una foto de su INE por el frente (lado con foto). Sé breve.

Si etapa es 'ask_ine_reverso':
NO saludes. Confirma que recibiste el frente del INE. Ahora pide la foto del reverso (lado con código de barras o QR).

Si etapa es 'documentos':
NO saludes. Confirma que recibiste el reverso del INE. Pide opcionalmente un comprobante de ingresos (nómina, estado de cuenta, o cualquier comprobante). Deja claro que es OPCIONAL, pero menciona que enviarlo aumenta significativamente las probabilidades de que su solicitud sea aprobada. Di que cuando esté listo — con o sin comprobante — escriba LISTO para continuar.

Si etapa es 'listo':
NO saludes. Di que recibiste todo y que Yunus está analizando su perfil y revisando viabilidad. Simula que hay un proceso en curso con bullets de pasos que está ejecutando (verificando identidad, analizando capacidad de pago, consultando disponibilidad de boletos, evaluando opciones de financiamiento). Di que esto puede tardar varios minutos y que puede salir de la conversación tranquilamente. Termina diciendo que un agente de Yunus se pondrá en contacto con él en cuanto tenga su resultado.

ETAPA ACTUAL: ${etapaParaGroq}`
      },
      {
        role: "user",
        content: `Mensaje: ${mensajeUsuario}`
      }
    ],
    max_tokens: 800,
    temperature: 0.3
  });

  const respuesta = completion.choices[0].message.content;

  // nuevaEtapa para guardar en Notion
  let nuevaEtapa = etapa;
  if (mensaje && mensaje.toUpperCase().includes("LISTO")) {
    nuevaEtapa = "listo";
  } else if (imagen) {
    if (etapa === "ask_ine_frente") nuevaEtapa = "ask_ine_reverso";
    else if (etapa === "ask_ine_reverso") nuevaEtapa = "documentos";
    else if (etapa === "documentos") nuevaEtapa = "documentos";
  } else if (etapa === "bienvenida") {
    nuevaEtapa = "ask_specs";
  } else if (etapa === "ask_specs") {
    nuevaEtapa = "ask_ine_frente";
  }

  const timestamp = new Date().toLocaleString("es-MX", { timeZone: "America/Ciudad_Juarez" });
  const entradaHistorial = imagen
    ? `[${timestamp}] Usuario: [imagen: ${imagenUrl}]\n[${timestamp}] Yunus: ${respuesta}\n`
    : `[${timestamp}] Usuario: ${mensaje}\n[${timestamp}] Yunus: ${respuesta}\n`;
  const nuevoHistorial = (historialActual + "\n" + entradaHistorial).slice(-2000);

  await notion.pages.update({
    page_id: pageId,
    properties: {
      Etapa: {
        rich_text: [{ text: { content: nuevaEtapa } }]
      },
      Historial: {
        rich_text: [{ text: { content: nuevoHistorial } }]
      },
      ...(imagenUrl && {
        Docs: {
          rich_text: [{ text: { content: imagenUrl } }]
        }
      })
    }
  });

  res.status(200).json({ respuesta, imagenUrl });
}