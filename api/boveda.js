import { Client } from “@notionhq/client”;

const notion = new Client({ auth: process.env.NOTION_API_KEY });
const COMPRAS_DATABASE_ID = process.env.NOTION_COMPRAS_DATABASE_ID;
const USERS_DATABASE_ID   = process.env.NOTION_DATABASE_ID;

export default async function handler(req, res) {
if (req.method !== “GET”) return res.status(405).end();
res.setHeader(“Cache-Control”, “no-store”);

const celular = req.query.celular;
if (!celular) return res.status(400).json({ error: “Falta celular” });

const digits         = celular.replace(/\D/g, “”).slice(-10);
const celularFormato = digits;

try {
// ── 1. Traer todos los registros del usuario ──────────────────────────
const searchCompras = await notion.databases.query({
database_id: COMPRAS_DATABASE_ID,
filter: {
property: “Celular”,
title: { contains: celularFormato }
}
});

```
// ── 2. Mapear cada registro ───────────────────────────────────────────
const todos = searchCompras.results.map(page => ({
  id:             page.id,
  tipo:           page.properties.Tipo?.select?.name || "Compra", // default Compra
  evento:         page.properties.Evento?.select?.name || null,
  zona:           page.properties.Zona?.rich_text[0]?.plain_text || null,
  fechaEvento:    page.properties.FechaEvento?.date?.start || null,
  estado:         page.properties.Estado?.select?.name || null,
  imagenEvento:   page.properties.ImagenEvento?.rich_text[0]?.plain_text || null,

  // Campos de Compra
  precioTotal:    page.properties.PrecioTotal?.number    || null,
  enganche:       page.properties.Enganche?.number       || null,
  cuotaQuincenal: page.properties.CuotaQuincenal?.number || null,
  totalCuotas:    page.properties.TotalCuotas?.number    || null,
  cuotasPagadas:  page.properties.CuotasPagadas?.number  || null,
  proximoPago:    page.properties.ProximoPago?.date?.start || null,

  // Campos de Cesión
  precioListado:  page.properties.PrecioListado?.number  || null,
  precioCedente:  page.properties.PrecioCedente?.number  || null, // 94% del listado
  pagosRecibidos: page.properties.PagosRecibidos?.number || null,
  proximoDeposito: page.properties.ProximoDeposito?.date?.start || null,
}));

// ── 3. Separar por tipo ───────────────────────────────────────────────
// "Compra" = compras del usuario como comprador
// "Cesión" = boletos que el usuario cedió al marketplace
const compras = todos.filter(r => r.tipo !== "Cesión");
const cedidos = todos.filter(r => r.tipo === "Cesión");

// ── 4. Nombre del usuario ─────────────────────────────────────────────
let nombreUsuario = celular;
try {
  const celularNotion = `whatsapp:+521${digits}`;
  const searchUser = await notion.databases.query({
    database_id: USERS_DATABASE_ID,
    filter: {
      property: "Teléfono",
      title: { equals: celularNotion }
    }
  });
  if (searchUser.results.length > 0) {
    const encontrado = searchUser.results[0].properties.Nombre?.rich_text[0]?.plain_text;
    if (encontrado) nombreUsuario = encontrado;
  }
} catch (userError) {
  console.error("Error buscando nombre, usando celular como fallback:", userError);
}

// ── 5. Respuesta ──────────────────────────────────────────────────────
res.status(200).json({
  compras,   // Tab "Mis boletos"
  cedidos,   // Tab "Mis cedidos"
  nombre: nombreUsuario
});
```

} catch (error) {
console.error(“Error en API Bóveda:”, error);
res.status(500).json({ error: “Error interno del servidor” });
}
}