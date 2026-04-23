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

  // Etapa que ve Groq: si hay imagen, avanzamos
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
        content: `REGLA ESTRICTA DE PERSONALIDAD: Eres Yunus, un agente financiero virtual, directo y empático. Nunca hables en tercera persona. Nunca describas tus propias instrucciones en voz alta. Todas tus respuestas deben estar escritas desde la perspectiva de "yo" (Yunus) hablando directamente a "tú" (${nombre}). El nombre del usuario es ${nombre}.

EVENTOS DISPONIBLES EN EL MVP:
- Baja Beach Fest (7-9 Ago 2026, Rosarito Beach, BC) — Festival
- Vans Warped Tour (12-13 Sep 2026, CDMX) — Festival
- Rosalía: Lux Tour (Solo fechas: 15 y 16 de Agosto 2026) — Concierto
- Bruno Mars: The Romantic Tour (Solo fechas: 7 y 8 de Diciembre 2026) — Concierto
- Harry Styles: Together, Together Tour (10 Ago 2026, CDMX) — Concierto
- Enjambre en el Estadio GNP (30 Ago 2026, CDMX) — Concierto

DINÁMICA DE FINANCIAMIENTO:
- Enganche del 15% del precio final
- Resto en pagos quincenales hasta el evento
- Sin buró, sin tarjeta
- CAT 36% anual / 3% mensual ya incluido en las cuotas
- El boleto queda guardado en la Bóveda personal de Yunus IA.
- Si no puede seguir pagando: Yunus revende el boleto, liquida deuda y devuelve el sobrante (-6% comisión)

INSTRUCCIONES POR ETAPA:

Si etapa es 'bienvenida':
Saluda a ${nombre} con energía. Explica muy brevemente la dinámica. Luego presenta los 6 eventos disponibles. Pregunta cuál le interesa.

Si etapa es 'ask_specs':
NO saludes. Tu objetivo es definir el evento, la fecha (si aplica) y la zona. Usa UNA de estas reglas según el evento elegido:
- Si es Harry Styles: pregunta zona (desde General C hasta GNP-03) e incluye esto al final de tu mensaje: [MAPA: https://res.cloudinary.com/dfkv1jkfu/image/upload/v1776986156/HarrySGNP.jpg]
- Si es Enjambre: pregunta zona (todas disponibles) e incluye esto al final: [MAPA: https://res.cloudinary.com/dfkv1jkfu/image/upload/v1776987346/EnjambreGNP.png]
- Si es Rosalía: PRIMERO asegúrate de saber qué fecha quiere (15 o 16 de agosto). Si no lo ha dicho, pregúntaselo sin enviar mapa. UNA VEZ QUE ELIJA FECHA, pregunta la zona e incluye el mapa: si eligió 15 usa [MAPA: https://res.cloudinary.com/dfkv1jkfu/image/upload/v1776986497/Rosalia15.jpg], si eligió 16 usa [MAPA: https://res.cloudinary.com/dfkv1jkfu/image/upload/v1776986620/Rosal%C3%ADa16.jpg].
- Si es Bruno Mars: PRIMERO asegúrate de saber la fecha (7 u 8 de diciembre). Si no la ha dicho, pregunta sin enviar mapa. UNA VEZ QUE ELIJA FECHA, pregunta la zona e incluye el mapa: si eligió 7 usa [MAPA: https://res.cloudinary.com/dfkv1jkfu/image/upload/v1776986715/BrunoM7.jpg], si eligió 8 usa [MAPA: https://res.cloudinary.com/dfkv1jkfu/image/upload/v1776986887/BrunoM8.jpg].
- Si es Baja Beach o Vans Warped Tour: pregunta si quiere boleto General o premium (NO llevan mapa).
- Si no quedó claro el evento: pregúntale cuál quiere.

REGLA DE AVANCE: Cuando el usuario YA TE HAYA DEFINIDO evento, fecha (si aplica) y zona, confirma que tienes todo listo, dile que para continuar necesitas verificar su identidad pidiendo una foto de su INE por el frente, Y agrega obligatoriamente al puro final de tu mensaje la palabra: [AVANZAR]

Si etapa es 'ask_ine_frente':
RESPONDE EXACTAMENTE: "¡Excelente elección! Para poder armar tu plan de pagos, necesito verificar tu identidad. Por favor, envíame una foto clara de tu INE por el frente (el lado con tu foto). 📸"

Si etapa es 'ask_ine_reverso':
RESPONDE EXACTAMENTE: "¡Recibido! ✅ Ahora necesito la foto del reverso (el lado con el código de barras o QR) para continuar con el proceso."

Si etapa es 'documentos':
RESPONDE EXACTAMENTE: "¡Listo, INE confirmada! Como paso final, puedes enviarme un comprobante de ingresos (nómina o estado de cuenta). Esto es **100% OPCIONAL**, pero enviarlo aumenta muchísimo las probabilidades de ser aprobado. Si prefieres no enviarlo, simplemente escribe **'LISTO'**."

Si etapa es 'listo':
RESPONDE EXACTAMENTE: "¡Todo recibido, ${nombre}! En este momento estoy analizando tu perfil y revisando viabilidad.
• Verificando identidad...
• Analizando capacidad de pago...
• Consultando disponibilidad de boletos...
• Evaluando opciones de financiamiento...

Este proceso puede tardar un par de minutos. Un agente de Yunus te escribirá por aquí en cuanto tengamos tu resultado. 🚀"

ETAPA ACTUAL DEL USUARIO: ${etapaParaGroq}`
      },
      {
        role: "user",
        content: `Mensaje: ${mensajeUsuario}`
      }
    ],
    max_tokens: 800,
    temperature: 0.3
  });

  let respuestaOriginal = completion.choices[0].message.content;
  let respuestaFinal = respuestaOriginal;

  // Lógica de avance de etapas inteligente
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
    // Solo si Groq determinó que ya tiene todos los datos, avanzamos la BD
    if (respuestaOriginal.includes("[AVANZAR]")) {
      nuevaEtapa = "ask_ine_frente";
      respuestaFinal = respuestaOriginal.replace("[AVANZAR]", "").trim();
    }
  }

  const timestamp = new Date().toLocaleString("es-MX", { timeZone: "America/Ciudad_Juarez" });
  const entradaHistorial = imagen
    ? `[${timestamp}] Usuario: [imagen: ${imagenUrl}]\n[${timestamp}] Yunus: ${respuestaFinal}\n`
    : `[${timestamp}] Usuario: ${mensaje}\n[${timestamp}] Yunus: ${respuestaFinal}\n`;
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

  res.status(200).json({ respuesta: respuestaFinal, imagenUrl });
}