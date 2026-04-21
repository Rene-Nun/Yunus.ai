import { Client } from “@notionhq/client”;

const notion = new Client({ auth: process.env.NOTION_API_KEY });

export default async function handler(req, res) {
if (req.method !== “POST”) return res.status(405).end();

const { id } = req.body;
if (!id) return res.status(400).json({ error: “Falta id” });

await notion.pages.update({
page_id: id,
properties: {
Estado: {
select: { name: “En Reventa” }
}
}
});

res.status(200).json({ ok: true });
}