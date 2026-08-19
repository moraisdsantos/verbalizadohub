import { createSupabaseContext } from "npm:@supabase/server@^1";

type DriveMetadata = {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
};

function extractDriveFileId(value: string) {
  const url = value.trim();
  return (
    url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/)?.[1] ??
    url.match(/[?&]id=([a-zA-Z0-9_-]+)/)?.[1] ??
    url.match(/\/d\/([a-zA-Z0-9_-]+)/)?.[1] ??
    (/^[a-zA-Z0-9_-]{10,}$/.test(url) ? url : "")
  );
}

function getCorsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
    Vary: "Origin",
  };
}

Deno.serve(async (request) => {
  const headers = getCorsHeaders();

  if (request.method === "OPTIONS") {
    return new Response("ok", { headers });
  }

  if (request.method !== "POST") {
    return Response.json({ error: "MÃ©todo nÃ£o permitido." }, { status: 405, headers });
  }

  const { error: authError } = await createSupabaseContext(request, {
    auth: "user",
  });

  if (authError) {
    console.error("Falha ao validar a sessÃ£o:", authError);
    return Response.json(
      { error: authError.message, code: authError.code },
      { status: authError.status ?? 401, headers },
    );
  }

  let body: { driveUrl?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Corpo da requisiÃ§Ã£o invÃ¡lido." }, { status: 400, headers });
  }

  const fileId = extractDriveFileId(body.driveUrl ?? "");
  if (!fileId) {
    return Response.json({ error: "Link do Google Drive invÃ¡lido." }, { status: 400, headers });
  }

  const googleDriveApiKey = Deno.env.get("GOOGLE_DRIVE_API_KEY");
  if (!googleDriveApiKey) {
    return Response.json(
      { error: "A funÃ§Ã£o nÃ£o possui a chave da API do Google Drive." },
      { status: 500, headers },
    );
  }

  const endpoint = new URL(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}`,
  );
  endpoint.searchParams.set("fields", "id,name,mimeType,size");
  endpoint.searchParams.set("key", googleDriveApiKey);

  const googleResponse = await fetch(endpoint);
  if (!googleResponse.ok) {
    return Response.json(
      {
        error:
          "NÃ£o foi possÃ­vel consultar o arquivo. Confirme se ele estÃ¡ pÃºblico e se a API do Google Drive estÃ¡ habilitada.",
      },
      { status: 400, headers },
    );
  }

  const metadata = (await googleResponse.json()) as DriveMetadata;
  if (!metadata.mimeType?.startsWith("audio/")) {
    return Response.json(
      { error: "O arquivo encontrado no Drive nÃ£o estÃ¡ identificado como Ã¡udio." },
      { status: 400, headers },
    );
  }

  return Response.json(
    {
      fileId: metadata.id,
      title: metadata.name,
      mimeType: metadata.mimeType,
      size: metadata.size ?? null,
    },
    { headers },
  );
});
