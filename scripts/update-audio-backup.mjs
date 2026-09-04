import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const supabaseUrl = (
  process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? ""
).trim();
const publishableKey = (
  process.env.SUPABASE_PUBLISHABLE_KEY ??
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
  ""
).trim();

if (!supabaseUrl || !publishableKey) {
  throw new Error(
    "Configure SUPABASE_URL e SUPABASE_PUBLISHABLE_KEY para atualizar o backup.",
  );
}

const endpoint = new URL("/rest/v1/audio_works", supabaseUrl);
endpoint.searchParams.set(
  "select",
  "id,drive_file_id,drive_url,title,mime_type,is_published,created_at,updated_at",
);
endpoint.searchParams.set("is_published", "eq.true");
endpoint.searchParams.set("order", "created_at.desc");

const response = await fetch(endpoint, {
  headers: {
    apikey: publishableKey,
    Authorization: `Bearer ${publishableKey}`,
    Accept: "application/json",
  },
  signal: AbortSignal.timeout(20_000),
});

if (!response.ok) {
  throw new Error(
    `O Supabase recusou a geração do backup (${response.status}). O snapshot anterior foi preservado.`,
  );
}

const works = await response.json();
if (!Array.isArray(works)) {
  throw new Error("O Supabase retornou um catálogo inválido. O snapshot anterior foi preservado.");
}

const outputPath = resolve("public/audio-catalog-backup.json");
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(
  outputPath,
  `${JSON.stringify(
    {
      version: 1,
      generated_at: new Date().toISOString(),
      works,
    },
    null,
    2,
  )}\n`,
  "utf8",
);

console.log(`Backup atualizado com ${works.length} obra(s) publicada(s).`);
