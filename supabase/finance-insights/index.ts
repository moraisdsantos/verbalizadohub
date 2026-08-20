type AuthValidation =
  | { ok: true }
  | { ok: false; status: number; message: string };

function getCorsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
    Vary: "Origin",
  };
}

async function validateUserSession(request: Request): Promise<AuthValidation> {
  const authorization = request.headers.get("Authorization")?.trim() ?? "";
  if (!authorization.startsWith("Bearer ")) {
    return { ok: false, status: 401, message: "Faça login novamente para consultar a análise financeira." };
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")?.trim() ?? "";
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")?.trim() ?? "";
  if (!supabaseUrl || !supabaseAnonKey) {
    return { ok: false, status: 500, message: "A autenticação da função não está configurada." };
  }

  try {
    const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { Authorization: authorization, apikey: supabaseAnonKey },
    });
    if (!response.ok) {
      return { ok: false, status: 401, message: "Sua sessão expirou. Entre novamente." };
    }
  } catch (error) {
    console.error("Falha ao validar a sessão:", error);
    return { ok: false, status: 502, message: "Não foi possível validar a sessão no Supabase Auth." };
  }

  return { ok: true };
}

function getOutputText(response: Record<string, unknown>) {
  if (typeof response.output_text === "string") return response.output_text;
  const output = Array.isArray(response.output) ? response.output : [];
  for (const item of output) {
    if (!item || typeof item !== "object") continue;
    const content = Array.isArray((item as { content?: unknown }).content)
      ? (item as { content: unknown[] }).content
      : [];
    for (const part of content) {
      if (
        part &&
        typeof part === "object" &&
        (part as { type?: string }).type === "output_text" &&
        typeof (part as { text?: unknown }).text === "string"
      ) {
        return (part as { text: string }).text;
      }
    }
  }
  return "";
}

Deno.serve(async (request) => {
  const headers = getCorsHeaders();
  if (request.method === "OPTIONS") return new Response("ok", { headers });
  if (request.method !== "POST") {
    return Response.json({ error: "Método não permitido." }, { status: 405, headers });
  }

  const auth = await validateUserSession(request);
  if (!auth.ok) {
    return Response.json({ error: auth.message }, { status: auth.status, headers });
  }

  try {
    const body = (await request.json()) as {
      period?: string;
      question?: string;
      summary?: unknown;
    };
    const period = String(body.period || "período não informado").slice(0, 120);
    const question = String(body.question || "").trim().slice(0, 1200);
    const summaryJson = JSON.stringify(body.summary ?? {});
    if (summaryJson.length > 30_000) {
      throw new Error("O resumo financeiro enviado é grande demais.");
    }

    const openAiKey = Deno.env.get("OPENAI_API_KEY")?.trim() ?? "";
    if (!openAiKey) throw new Error("A chave da OpenAI não está configurada na função.");
    const model = Deno.env.get("OPENAI_MODEL")?.trim() || "gpt-4.1-mini";

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openAiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        instructions:
          "Você é um analista financeiro da ver.balizado, empresa brasileira de acessibilidade comunicacional. " +
          "Analise somente os dados agregados fornecidos, em português do Brasil. Não invente causas nem valores. " +
          "Diferencie fatos, projeções e hipóteses. Valores estão em reais. Destaque lacunas de cadastro que limitem a conclusão. " +
          "Organize a resposta com: Sumário executivo, Saúde financeira, Mercados e rentabilidade, Riscos, Recomendações práticas. " +
          "Não substitua orientação contábil, fiscal ou jurídica profissional.",
        input:
          `Período selecionado: ${period}.\n` +
          `Dados financeiros agregados: ${summaryJson}.\n` +
          (question ? `Pergunta específica do gestor: ${question}` : "Faça uma leitura geral do período."),
        max_output_tokens: 1800,
      }),
    });

    const result = (await response.json()) as Record<string, unknown> & {
      error?: { message?: string };
    };
    if (!response.ok) {
      console.error("OpenAI recusou a análise financeira:", result.error ?? result);
      throw new Error(result.error?.message || "A OpenAI não conseguiu analisar os dados financeiros.");
    }

    const answer = getOutputText(result);
    if (!answer) throw new Error("A OpenAI não devolveu a análise financeira.");
    return Response.json({ answer }, { headers });
  } catch (error) {
    console.error("Erro em finance-insights:", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Não foi possível gerar a análise financeira." },
      { status: 400, headers },
    );
  }
});
