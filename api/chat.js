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
  // ── Captura global: nunca dejar que el frontend vea un 500 desnudo ──
  try {
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

    // ── MODO SILENCIO: etapa "listo" → guardar en Notion pero NO llamar a Groq ──
    if (etapa === "listo") {
      if (mensaje) {
        const timestamp = new Date().toLocaleString("es-MX", { timeZone: "America/Ciudad_Juarez" });
        const entradaHistorial = `[${timestamp}] Usuario: ${mensaje}\n`;
        const nuevoHistorial = (historialActual + "\n" + entradaHistorial).slice(-2000);
        await notion.pages.update({
          page_id: pageId,
          properties: {
            Historial: { rich_text: [{ text: { content: nuevoHistorial } }] }
          }
        });
      }
      return res.status(200).json({ respuesta: null, etapa: "listo" });
    }

    let imagenUrl = null;
    if (imagen) {
      const upload = await cloudinary.uploader.upload(imagen, {
        folder: `yunus/${celular}`,
        resource_type: "image"
      });
      imagenUrl = upload.secure_url;
    }

    let etapaParaGroq = etapa;
    if (imagen) {
      if (etapa === "ask_ine_frente") etapaParaGroq = "ask_ine_reverso";
      else if (etapa === "ask_ine_reverso") etapaParaGroq = "documentos";
    }

    const mensajeUsuario = imagen ? "El usuario mandó una imagen" : mensaje;

    // ── Llamada a Groq con manejo explícito de errores ──
    let completion;
    try {
      completion = await groq.chat.completions.create({
        model: "moonshotai/kimi-k2-instruct",
        messages: [
          {
            role: "system",
            content: `REGLA ESTRICTA DE PERSONALIDAD: Eres Yunus, un agente financiero virtual, directo y empático. Nunca hables en tercera persona. Nunca describas tus propias instrucciones en voz alta. Todas tus respuestas deben estar escritas desde la perspectiva de "yo" (Yunus) hablando directamente a "tú" (${nombre}). El nombre del usuario es ${nombre}.

EVENTOS DISPONIBLES EN EL MVP:
- Baja Beach Fest (7-9 Ago 2026, Rosarito Beach, BC)
- Vans Warped Tour (12-13 Sep 2026, CDMX)
- Rosalía: Lux Tour (Solo fechas: 15 y 16 de Agosto 2026)
- Bruno Mars: The Romantic Tour (Solo fechas: 7 y 8 de Diciembre 2026)
- Harry Styles: Together, Together Tour (10 Ago 2026, CDMX)
- Enjambre en el Estadio GNP (30 Ago 2026, CDMX)

DINÁMICA DE FINANCIAMIENTO:
- Pago Inicial (Enganche) del 15%.
- Resto dividido en pagos quincenales (desde 6 hasta 10 quincenas).
- Sin buró, sin tarjeta. CAT anual del 36% incluido en las cuotas.
- El boleto queda en la Bóveda de Yunus IA.
- Si no puede seguir pagando: Yunus revende el boleto, liquida deuda y devuelve el sobrante (-6% comisión).

PRECIOS Y ZONAS:
¡REGLA DE ORO!: NO desgloses precios A MENOS que el usuario lo pida EXPLÍCITAMENTE.

- Baja Beach Fest: General $10,201.18 | General+ $11,990.86 | VIP $25,541.31
- Harry Styles: GENERAL C $1,968.98 | NA11-NA16 $3,804-$5,220 | VE14-VE16 $4,471-$6,260 | GNP01-GNP10 $5,639-$6,767
- Rosalía 15 Ago: GP05C-GP06C $4,095.28
- Rosalía 16 Ago: General $3,320.34 | GP05C-GP08C $3,804.42 | GOLD CIRCLE IZQ $5,990.05 | GP01B-GP02B $6,672.62
- Vans Warped Tour: General $4,306 (6Q) / $4,408 (8Q) | Plus $7,783 (6Q) / $7,967 (8Q)
- Bruno Mars: General B desde $2,315 | NA desde $4,643 | VE desde $4,318 | GNP desde $4,985 | ROSA desde $7,321 | GOLD desde $8,322 | PLAT desde $9,323
- Enjambre: Precios por anunciarse (Preventa Exclusiva Banamex). Yunus habilitará en venta general.

DESGLOSE DETALLADO DE PRECIOS (solo si el usuario pide explícitamente el desglose):
- Baja Beach Fest: General Inic $1,421.44 6Q $1,463.29 | General+ Inic $1,670.81 6Q $1,720.00 | VIP Inic $3,558.94 6Q $3,663.72
- Harry Styles: GENERAL C Inic $274.36 6Q $282.43 | NA11-NA16 Inic $530-$727 6Q $545-$748 | VE14-VE16 Inic $623-$872 6Q $641-$898 | GNP01-GNP10 Inic $785-$943 6Q $809-$970
- Rosalía 15 Ago: GP05C-GP06C Inic $570.64 6Q $587.44
- Rosalía 16 Ago: General Inic $462.66 6Q $476.28 | GP05C-GP08C Inic $530.11 6Q $545.71 | GOLD Inic $834.66 6Q $859.23 | GP01B-GP02B Inic $929.77 6Q $957.14
- Vans Warped: General Inic $600 (6Q $617.66 / 8Q $476.00) | Plus Inic $1,084.50 (6Q $1,116.43 / 8Q $860.37)
- Bruno Mars: General B Inic $322.69 (6Q $2,315 / 8Q $2,370 / 10Q $2,425) | NA Inic $647.04 | VE Inic $601-$872 | MORA Inic $834.19 | GNP Inic $694-$1,042 | ROSA Inic $1,020-$1,530 | GOLD Inic $1,159-$1,739 | PLAT Inic $1,299-$1,948

INSTRUCCIONES POR ETAPA:

Si etapa es 'bienvenida':
Saluda a ${nombre} con energía. Explica brevemente la dinámica. Presenta los 6 eventos. Pregunta cuál le interesa.

Si etapa es 'ask_specs':
NO saludes. Define evento, fecha y zona.
- Harry Styles → pregunta zona + [MAPA: https://res.cloudinary.com/dfkv1jkfu/image/upload/v1776986156/HarrySGNP.jpg]
- Enjambre → pregunta zona + [MAPA: https://res.cloudinary.com/dfkv1jkfu/image/upload/v1776987346/EnjambreGNP.png]
- Rosalía → primero fecha (15 o 16). Con fecha: zona + mapa 15→[MAPA: https://res.cloudinary.com/dfkv1jkfu/image/upload/v1776986497/Rosalia15.jpg] 16→[MAPA: https://res.cloudinary.com/dfkv1jkfu/image/upload/v1776986620/Rosal%C3%ADa16.jpg]
- Bruno Mars → primero fecha (7 u 8). Con fecha: zona + mapa 7→[MAPA: https://res.cloudinary.com/dfkv1jkfu/image/upload/v1776986715/BrunoM7.jpg] 8→[MAPA: https://res.cloudinary.com/dfkv1jkfu/image/upload/v1776986887/BrunoM8.jpg]
- Baja Beach / Vans Warped → pregunta General o premium (sin mapa).
REGLA DE AVANCE: Con evento+fecha+zona definidos, confirma la zona y pide INE frente. Agrega [AVANZAR] al final.

Si etapa es 'ask_ine_frente':
RESPONDE EXACTAMENTE: "¡Excelente elección! Para poder armar tu plan de pagos, necesito verificar tu identidad. Por favor, envíame una foto clara de tu INE por el frente (el lado con tu foto). 📸"

Si etapa es 'ask_ine_reverso':
RESPONDE EXACTAMENTE: "¡Recibido! ✅ Ahora necesito la foto del reverso (el lado con el código de barras o QR) para continuar con el proceso."

Si etapa es 'documentos':
RESPONDE EXACTAMENTE: "¡Listo, INE confirmada! Como paso final, puedes enviarme un comprobante de ingresos (nómina o estado de cuenta). Esto es **100% OPCIONAL**, pero enviarlo aumenta muchísimo las probabilidades de ser aprobado. Si prefieres no enviarlo, simplemente escribe **'LISTO'**."

Si etapa es 'listo':
RESPONDE EXACTAMENTE: "¡Todo recibido, ${nombre}! 🎉 En este momento estoy analizando tu perfil.
• Verificando identidad...
• Analizando capacidad de pago...
• Consultando disponibilidad de boletos...
• Evaluando opciones de financiamiento...

Aquí mismo, en este chat, te daré el resultado en cuanto esté listo. No cierres la app. 🚀"

ETAPA ACTUAL: ${etapaParaGroq}

HISTORIAL (para recordar evento, fecha y zona elegidos):
${historialActual}`
          },
          {
            role: "user",
            content: `Mensaje: ${mensajeUsuario}`
          }
        ],
        max_tokens: 600,
        temperature: 0.3
      });
    } catch (groqError) {
      console.error("Groq error:", groqError?.status, groqError?.message);

      // ── Rate limit de Groq (429) → respuesta amigable, NO un 500 ──
      if (groqError?.status === 429) {
        return res.status(200).json({
          respuesta: "Estoy procesando muchas solicitudes en este momento. Espera unos segundos e intenta de nuevo. 🙏",
          etapa: etapa
        });
      }

      // Otro error de Groq → respuesta genérica amigable
      return res.status(200).json({
        respuesta: "Tuve un problema técnico momentáneo. Por favor intenta de nuevo. 🙏",
        etapa: etapa
      });
    }

    let respuestaOriginal = completion.choices[0].message.content;
    let respuestaFinal = respuestaOriginal;

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
        Etapa: { rich_text: [{ text: { content: nuevaEtapa } }] },
        Historial: { rich_text: [{ text: { content: nuevoHistorial } }] },
        ...(imagenUrl && {
          Docs: { rich_text: [{ text: { content: imagenUrl } }] }
        })
      }
    });

    return res.status(200).json({ respuesta: respuestaFinal, imagenUrl, etapa: nuevaEtapa });

  } catch (fatalError) {
    // ── Captura global: cualquier error no previsto → 200 amigable, nunca 500 ──
    console.error("Fatal error in /api/chat:", fatalError);
    return res.status(200).json({
      respuesta: "Ocurrió un error inesperado. Por favor intenta de nuevo en un momento. 🙏",
      etapa: "bienvenida"
    });
  }
}