import {
  FunctionsFetchError,
  FunctionsHttpError,
  FunctionsRelayError,
  type Session,
} from "@supabase/supabase-js";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import AudioPlayer from "./components/AudioPlayer";
import ClientsPage from "./components/ClientsPage";
import ContractsPage from "./components/ContractsPage";
import FinancialPage from "./components/FinancialPage";
import HomePage from "./components/HomePage";
import HubLogin, { HubAccessLoading } from "./components/HubLogin";
import ProjectsPage from "./components/ProjectsPage";
import QrDialog from "./components/QrDialog";
import { loadAudioCatalogBackup } from "./lib/audioBackup";
import { extractDriveFileId } from "./lib/drive";
import { ensureActiveSession, isSupabaseConfigured, supabase } from "./lib/supabase";
import type { AudioWork, DriveMetadata } from "./types";

type HubRoute = "home" | "catalogo" | "clientes" | "contratos" | "projetos" | "financeiro";
const logoUrl = `${import.meta.env.BASE_URL}verbalizado-horizontal.png`;
const catalogRequestTimeout = 8_000;

async function withCatalogTimeout<T>(request: PromiseLike<T>): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve(request),
      new Promise<T>((_resolve, reject) => {
        timeoutId = setTimeout(
          () => reject(new Error("Tempo de resposta do catálogo excedido.")),
          catalogRequestTimeout,
        );
      }),
    ]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

function backupDateLabel(value: string | null) {
  if (!value) return "data não informada";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "data não informada";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

function getHubRoute(): HubRoute {
  if (window.location.hash === "#/catalogo") return "catalogo";
  if (window.location.hash === "#/clientes") return "clientes";
  if (window.location.hash === "#/contratos") return "contratos";
  if (window.location.hash === "#/projetos") return "projetos";
  if (window.location.hash === "#/financeiro") return "financeiro";
  return "home";
}

async function edgeFunctionErrorMessage(error: unknown) {
  if (error instanceof FunctionsHttpError) {
    try {
      const details = (await error.context.json()) as { error?: string };
      return details.error ?? "A função drive-metadata recusou a solicitação.";
    } catch {
      return "A função drive-metadata retornou um erro.";
    }
  }

  if (error instanceof FunctionsFetchError) {
    return "O navegador não conseguiu conectar à função drive-metadata.";
  }

  if (error instanceof FunctionsRelayError) {
    return "O Supabase não conseguiu iniciar a função drive-metadata.";
  }

  if (error instanceof Error) return error.message;
  return "Não foi possível obter o nome do arquivo no Google Drive.";
}

export default function App() {
  const sharedWorkId = useMemo(
    () => new URLSearchParams(window.location.search).get("obra"),
    [],
  );
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [works, setWorks] = useState<AudioWork[]>([]);
  const [selectedWork, setSelectedWork] = useState<AudioWork | null>(null);
  const [sharedWork, setSharedWork] = useState<AudioWork | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [pageMessage, setPageMessage] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loginMessage, setLoginMessage] = useState("");
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [driveUrl, setDriveUrl] = useState("");
  const [publishImmediately, setPublishImmediately] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [shareWork, setShareWork] = useState<AudioWork | null>(null);
  const [replaceWork, setReplaceWork] = useState<AudioWork | null>(null);
  const [replacementDriveUrl, setReplacementDriveUrl] = useState("");
  const [isReplacingAudio, setIsReplacingAudio] = useState(false);
  const [isUsingCatalogBackup, setIsUsingCatalogBackup] = useState(false);
  const [catalogBackupDate, setCatalogBackupDate] = useState<string | null>(null);
  const [route, setRoute] = useState<HubRoute>(getHubRoute);

  useEffect(() => {
    const handleRouteChange = () => {
      setRoute(getHubRoute());
      window.scrollTo({ top: 0, behavior: "smooth" });
    };

    window.addEventListener("hashchange", handleRouteChange);
    return () => window.removeEventListener("hashchange", handleRouteChange);
  }, []);

  useEffect(() => {
    if (sharedWorkId) return;
    if (route === "catalogo") {
      document.title = "Catálogo de audiodescrições | ver.balizado";
    } else if (route === "clientes") {
      document.title = "Clientes e propostas | ver.balizado";
    } else if (route === "contratos") {
      document.title = "Contratos | ver.balizado";
    } else if (route === "projetos") {
      document.title = "Visão de projetos | ver.balizado";
    } else if (route === "financeiro") {
      document.title = "Visão financeira | ver.balizado";
    } else {
      document.title = "Hub operacional | ver.balizado";
    }
  }, [route, sharedWorkId]);

  const loadWorks = useCallback(async () => {
    setIsLoading(true);
    let loadedWorks: AudioWork[] | null = null;

    if (supabase) {
      try {
        const { data, error } = await withCatalogTimeout(
          supabase
            .from("audio_works")
            .select("*")
            .order("created_at", { ascending: false }),
        );
        if (!error) loadedWorks = (data ?? []) as AudioWork[];
      } catch {
        loadedWorks = null;
      }
    }

    if (!loadedWorks) {
      try {
        const backup = await loadAudioCatalogBackup();
        loadedWorks = backup.works;
        setIsUsingCatalogBackup(true);
        setCatalogBackupDate(backup.generatedAt);
        setPageMessage(
          `Catálogo em modo de contingência. Exibindo o backup de ${backupDateLabel(
            backup.generatedAt,
          )}.`,
        );
      } catch {
        setPageMessage(
          "O catálogo principal e o backup estático estão temporariamente indisponíveis.",
        );
        setIsLoading(false);
        return;
      }
    } else {
      setIsUsingCatalogBackup(false);
      setCatalogBackupDate(null);
    }

    setWorks(loadedWorks);
    setSelectedWork((current) => {
      if (current) {
        return loadedWorks.find((work) => work.id === current.id) ?? null;
      }
      return null;
    });
    setIsLoading(false);
  }, []);

  useEffect(() => {
    if (!supabase) {
      setAuthReady(true);
      setIsLoading(false);
      return;
    }

    let active = true;
    void ensureActiveSession().then((activeSession) => {
      if (!active) return;
      setSession(activeSession);
      setAuthReady(true);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setAuthReady(true);
    });

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!authReady || sharedWorkId || route !== "catalogo") return;
    void loadWorks();
  }, [authReady, loadWorks, route, session, sharedWorkId]);

  useEffect(() => {
    if (!authReady || !sharedWorkId) return;
    let active = true;
    setIsLoading(true);

    void (async () => {
      let work: AudioWork | null = null;
      let shouldTryBackup = !supabase;

      if (supabase) {
        try {
          const { data, error } = await withCatalogTimeout(
            supabase
              .from("audio_works")
              .select("*")
              .eq("id", sharedWorkId)
              .eq("is_published", true)
              .single(),
          );
          if (data) work = data as AudioWork;
          shouldTryBackup = Boolean(error && error.code !== "PGRST116");
        } catch {
          shouldTryBackup = true;
        }
      }

      if (!work && shouldTryBackup) {
        try {
          const backup = await loadAudioCatalogBackup();
          work = backup.works.find((item) => item.id === sharedWorkId) ?? null;
          if (work) {
            setIsUsingCatalogBackup(true);
            setCatalogBackupDate(backup.generatedAt);
          }
        } catch {
          work = null;
        }
      }

      if (!active) return;
      if (work) {
        setSharedWork(work);
        document.title = `${work.title} | ver.balizado`;
      } else {
        setPageMessage(
          shouldTryBackup
            ? "Esta audiodescrição não consta no último backup disponível."
            : "Esta audiodescrição não foi encontrada ou ainda não está publicada.",
        );
        setSharedWork(null);
      }
      setIsLoading(false);
    })();

    return () => {
      active = false;
    };
  }, [authReady, sharedWorkId]);

  async function signInWithPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) return;
    setLoginMessage("");
    setIsSigningIn(true);

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) {
        console.error("Erro do Supabase Auth:", error);

        if (error.code === "invalid_credentials") {
          setLoginMessage("E-mail ou senha incorretos.");
        } else if (error.code === "email_not_confirmed") {
          setLoginMessage("Este usuário ainda não foi confirmado no Supabase Auth.");
        } else {
          setLoginMessage(
            `Erro do Supabase: ${error.message}${
              error.code ? ` (${error.code})` : ""
            }`,
          );
        }
        return;
      }

      setPassword("");
      setLoginMessage("");
    } catch (error) {
      console.error("Falha de conexão com o Supabase:", error);
      const message = error instanceof Error ? error.message : "Erro desconhecido";
      setLoginMessage(`Falha de conexão: ${message}`);
    } finally {
      setIsSigningIn(false);
    }
  }

  async function signOut() {
    if (!supabase) return;
    await supabase.auth.signOut();
    setPageMessage("Sessão encerrada.");
  }

  async function addWork(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !session) return;
    setPageMessage("");

    const activeSession = await ensureActiveSession();
    if (!activeSession) {
      setSession(null);
      setPageMessage("Sua sessão expirou. Entre novamente antes de adicionar o áudio.");
      return;
    }

    const fileId = extractDriveFileId(driveUrl);
    if (!fileId) {
      setPageMessage("Insira um link válido de arquivo do Google Drive.");
      return;
    }

    setIsSaving(true);
    let metadata: unknown = null;

    try {
      const result = await supabase.functions.invoke("drive-metadata", {
        body: { driveUrl },
        headers: { Authorization: `Bearer ${activeSession.access_token}` },
      });

      if (result.error) {
        setPageMessage(await edgeFunctionErrorMessage(result.error));
        setIsSaving(false);
        return;
      }

      metadata = result.data;
    } catch (error) {
      setPageMessage(await edgeFunctionErrorMessage(error));
      setIsSaving(false);
      return;
    }

    if (!metadata) {
      setPageMessage("A função drive-metadata não retornou os dados do arquivo.");
      setIsSaving(false);
      return;
    }

    const driveMetadata = metadata as DriveMetadata & { error?: string };
    if (driveMetadata.error) {
      setPageMessage(driveMetadata.error);
      setIsSaving(false);
      return;
    }

    const { error: insertError } = await supabase.from("audio_works").insert({
      drive_file_id: driveMetadata.fileId,
      drive_url: driveUrl.trim(),
      title: driveMetadata.title,
      mime_type: driveMetadata.mimeType,
      is_published: publishImmediately,
      created_by: activeSession.user.id,
    });

    if (insertError) {
      setPageMessage(
        insertError.code === "23505"
          ? "Este arquivo do Google Drive já está cadastrado."
          : `Não foi possível salvar a obra: ${insertError.message}${
              insertError.code ? ` (${insertError.code})` : ""
            }`,
      );
      setIsSaving(false);
      return;
    }

    setDriveUrl("");
    setPageMessage(`“${driveMetadata.title}” foi salva no catálogo.`);
    setIsSaving(false);
    await loadWorks();
  }

  async function publishWork(work: AudioWork) {
    if (!supabase || !session) return;
    const { error } = await supabase
      .from("audio_works")
      .update({ is_published: true })
      .eq("id", work.id);

    setPageMessage(
      error
        ? `Não foi possível alterar a publicação: ${error.message}`
        : "A obra foi publicada.",
    );
    if (!error) await loadWorks();
  }

  function openAudioReplacement(work: AudioWork) {
    setReplaceWork(work);
    setReplacementDriveUrl("");
    setPageMessage("");
  }

  async function replaceWorkAudio(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !session || !replaceWork) return;
    setPageMessage("");

    const activeSession = await ensureActiveSession();
    if (!activeSession) {
      setSession(null);
      setReplaceWork(null);
      setPageMessage("Sua sessão expirou. Entre novamente antes de substituir o áudio.");
      return;
    }

    const fileId = extractDriveFileId(replacementDriveUrl);
    if (!fileId) {
      setPageMessage("Insira um link válido de arquivo do Google Drive.");
      return;
    }

    setIsReplacingAudio(true);

    try {
      const result = await supabase.functions.invoke("drive-metadata", {
        body: { driveUrl: replacementDriveUrl },
        headers: { Authorization: `Bearer ${activeSession.access_token}` },
      });

      if (result.error) {
        setPageMessage(await edgeFunctionErrorMessage(result.error));
        return;
      }

      const driveMetadata = result.data as
        | (DriveMetadata & { error?: string })
        | null;
      if (!driveMetadata) {
        setPageMessage("A função drive-metadata não retornou os dados do arquivo.");
        return;
      }
      if (driveMetadata.error) {
        setPageMessage(driveMetadata.error);
        return;
      }

      const { error } = await supabase
        .from("audio_works")
        .update({
          drive_file_id: driveMetadata.fileId,
          drive_url: replacementDriveUrl.trim(),
          mime_type: driveMetadata.mimeType,
        })
        .eq("id", replaceWork.id);

      if (error) {
        setPageMessage(
          error.code === "23505"
            ? "Este arquivo do Google Drive já está vinculado a outra obra."
            : `Não foi possível substituir o áudio: ${error.message}${
                error.code ? ` (${error.code})` : ""
              }`,
        );
        return;
      }

      const replacedTitle = replaceWork.title;
      setReplaceWork(null);
      setReplacementDriveUrl("");
      setPageMessage(
        `O áudio de “${replacedTitle}” foi substituído. O link e o QR Code da obra continuam os mesmos.`,
      );
      await loadWorks();
    } catch (error) {
      setPageMessage(await edgeFunctionErrorMessage(error));
    } finally {
      setIsReplacingAudio(false);
    }
  }

  async function deleteWork(work: AudioWork) {
    if (!supabase || !session) return;
    if (!window.confirm(`Remover “${work.title}” do catálogo?`)) return;

    const { error } = await supabase.from("audio_works").delete().eq("id", work.id);
    setPageMessage(
      error
        ? `Não foi possível remover a obra: ${error.message}${
            error.code ? ` (${error.code})` : ""
          }`
        : "A obra foi removida.",
    );
    if (!error) await loadWorks();
  }

  if (!isSupabaseConfigured && !sharedWorkId && route !== "catalogo") {
    return (
      <div className="setup-screen">
        <section className="setup-card">
          <p className="brand-kicker">ver.balizado</p>
          <h1>Conecte o projeto ao Supabase</h1>
          <p>
            Defina <code>VITE_SUPABASE_URL</code> e{" "}
            <code>VITE_SUPABASE_PUBLISHABLE_KEY</code> para iniciar o catálogo.
          </p>
          <p className="setup-note">
            O arquivo <code>.env.example</code> e o README explicam a configuração.
          </p>
        </section>
      </div>
    );
  }

  if (!sharedWorkId && route === "home") {
    if (!authReady) {
      return <HubAccessLoading />;
    }

    if (!session) {
      return (
        <HubLogin
          email={email}
          password={password}
          message={loginMessage}
          isSubmitting={isSigningIn}
          onEmailChange={setEmail}
          onPasswordChange={setPassword}
          onSubmit={signInWithPassword}
        />
      );
    }

    return (
      <HomePage
        userEmail={session.user.email ?? "Usuário autorizado"}
        onSignOut={signOut}
      />
    );
  }

  if (sharedWorkId) {
    return (
      <main className="shared-page">
        <div className="shared-player-layout">
          <img
            className="shared-player-logo"
            src={logoUrl}
            alt="ver.balizado — acessibilidade comunicacional"
          />
          {isUsingCatalogBackup ? (
            <p className="contingency-notice" role="status">
              Modo de contingência: dados recuperados do backup de {" "}
              {backupDateLabel(catalogBackupDate)}.
            </p>
          ) : null}
          {isLoading ? <p>Carregando audiodescrição…</p> : null}
          {!isLoading && sharedWork ? (
            <AudioPlayer work={sharedWork} autoPlay />
          ) : null}
          {!isLoading && !sharedWork ? (
            <section className="not-found-card" role="alert">
              <span className="ad-mark" aria-hidden="true">
                AD
              </span>
              <h1>Audiodescrição indisponível</h1>
              <p>{pageMessage}</p>
            </section>
          ) : null}
        </div>
      </main>
    );
  }

  if (route === "clientes") {
    if (!authReady) {
      return <HubAccessLoading />;
    }

    if (!session) {
      return (
        <HubLogin
          email={email}
          password={password}
          message={loginMessage}
          isSubmitting={isSigningIn}
          onEmailChange={setEmail}
          onPasswordChange={setPassword}
          onSubmit={signInWithPassword}
        />
      );
    }

    return (
      <ClientsPage
        userEmail={session.user.email ?? "Usuário autorizado"}
        onSignOut={signOut}
      />
    );
  }

  if (route === "contratos") {
    if (!authReady) {
      return <HubAccessLoading />;
    }

    if (!session) {
      return (
        <HubLogin
          email={email}
          password={password}
          message={loginMessage}
          isSubmitting={isSigningIn}
          onEmailChange={setEmail}
          onPasswordChange={setPassword}
          onSubmit={signInWithPassword}
        />
      );
    }

    return (
      <ContractsPage
        userEmail={session.user.email ?? "Usuário autorizado"}
        onSignOut={signOut}
      />
    );
  }

  if (route === "projetos") {
    if (!authReady) {
      return <HubAccessLoading />;
    }

    if (!session) {
      return (
        <HubLogin
          email={email}
          password={password}
          message={loginMessage}
          isSubmitting={isSigningIn}
          onEmailChange={setEmail}
          onPasswordChange={setPassword}
          onSubmit={signInWithPassword}
        />
      );
    }

    return (
      <ProjectsPage
        userEmail={session.user.email ?? "Usuário autorizado"}
        onSignOut={signOut}
      />
    );
  }

  if (route === "financeiro") {
    if (!authReady) {
      return <HubAccessLoading />;
    }

    if (!session) {
      return (
        <HubLogin
          email={email}
          password={password}
          message={loginMessage}
          isSubmitting={isSigningIn}
          onEmailChange={setEmail}
          onPasswordChange={setPassword}
          onSubmit={signInWithPassword}
        />
      );
    }

    return (
      <FinancialPage
        userEmail={session.user.email ?? "Usuário autorizado"}
        onSignOut={signOut}
      />
    );
  }

  return (
    <div className="app-shell">
      <header className="catalog-heading">
        <div>
          {session ? (
            <a className="back-to-hub" href="#/">
              <span aria-hidden="true">←</span>
              Voltar ao hub
            </a>
          ) : null}
          <p className="brand-kicker">ver.balizado</p>
          <h1>Catálogo de audiodescrições</h1>
          <p>
            {session
              ? " "
              : "Ouça as audiodescrições disponíveis e selecione uma obra para reproduzir."}
          </p>
        </div>
        {session ? (
          <div className="account-box">
            <span>{session.user.email}</span>
            <button type="button" onClick={signOut}>
              Sair
            </button>
          </div>
        ) : null}
      </header>

      {session ? (
        <section className="manager-panel" aria-labelledby="add-title">
          <div>
            <p className="section-eyebrow">Área administrativa</p>
            <h2 id="add-title">Adicionar audiodescrição</h2>
            <p>
              O nome original do arquivo será consultado automaticamente no
              Google Drive.
            </p>
          </div>
          <form onSubmit={addWork}>
            <label htmlFor="drive-url">Link público do Google Drive</label>
            <div className="form-row">
              <input
                id="drive-url"
                type="url"
                required
                value={driveUrl}
                onChange={(event) => setDriveUrl(event.target.value)}
                placeholder="https://drive.google.com/file/d/…/view"
              />
              <button type="submit" disabled={isSaving}>
                {isSaving ? "Salvando…" : "Adicionar áudio"}
              </button>
            </div>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={publishImmediately}
                onChange={(event) => setPublishImmediately(event.target.checked)}
              />
              Publicar imediatamente e permitir o acesso pelo QR Code
            </label>
          </form>
        </section>
      ) : null}

      <p className="page-message" role="status" aria-live="polite">
        {pageMessage}
      </p>

      {selectedWork ? (
        <section className="selected-player" aria-label="Obra selecionada">
          <p className="section-eyebrow">Obra selecionada</p>
          <AudioPlayer key={selectedWork.id} work={selectedWork} />
        </section>
      ) : null}

      <section className="works-section" aria-labelledby="works-title">
        <div className="works-section-heading">
          <div>
            <p className="section-eyebrow">
              {session ? "Banco de obras" : "Obras publicadas"}
            </p>
            <h2 id="works-title">Audiodescrições</h2>
          </div>
          <span className="work-count">
            {works.length} {works.length === 1 ? "obra" : "obras"}
          </span>
        </div>

        {isLoading ? <p className="loading-list">Carregando catálogo…</p> : null}
        {!isLoading && works.length === 0 ? (
          <div className="empty-state">
            <span className="ad-mark" aria-hidden="true">
              AD
            </span>
            <h3>Nenhuma audiodescrição disponível</h3>
            <p>
              {session
                ? "Adicione o primeiro arquivo do Google Drive acima."
                : "As obras publicadas aparecerão aqui."}
            </p>
          </div>
        ) : null}

        {!isLoading && works.length ? (
          <ul className="works-list">
            {works.map((work, index) => (
              <li key={work.id} className="work-item">
                <span className="work-number" aria-hidden="true">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <div className="work-info">
                  <h3>{work.title}</h3>
                  <p>
                    Audiodescrição · {work.is_published ? "Publicada" : "Oculta"}
                  </p>
                </div>
                <div className="work-actions">
                  <button type="button" onClick={() => setSelectedWork(work)}>
                    Ouvir
                  </button>
                  {work.is_published ? (
                    <button type="button" onClick={() => setShareWork(work)}>
                      QR Code
                    </button>
                  ) : null}
                  {session ? (
                    <>
                      <button
                        type="button"
                        onClick={() => openAudioReplacement(work)}
                      >
                        Substituir áudio
                      </button>
                      {!work.is_published ? (
                        <button type="button" onClick={() => publishWork(work)}>
                          Publicar
                        </button>
                      ) : null}
                      <button
                        className="remove-button"
                        type="button"
                        onClick={() => deleteWork(work)}
                      >
                        Remover
                      </button>
                    </>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      {shareWork ? (
        <QrDialog work={shareWork} onClose={() => setShareWork(null)} />
      ) : null}

      {session && replaceWork ? (
        <div className="modal-backdrop" role="presentation">
          <section
            className="share-dialog replace-audio-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="replace-audio-title"
          >
            <button
              className="close-dialog"
              type="button"
              onClick={() => setReplaceWork(null)}
              aria-label="Fechar substituição de áudio"
              disabled={isReplacingAudio}
            >
              ×
            </button>
            <p className="section-eyebrow">QR Code permanente</p>
            <h2 id="replace-audio-title">Substituir áudio</h2>
            <p className="dialog-description">
              Informe o link público do novo arquivo para substituir o áudio de
              <strong> “{replaceWork.title}”</strong>. O cadastro, o título, o link
              individual e o QR Code serão preservados.
            </p>
            <form onSubmit={replaceWorkAudio}>
              <label htmlFor="replacement-drive-url">
                Novo link público do Google Drive
              </label>
              <input
                id="replacement-drive-url"
                type="url"
                required
                autoFocus
                value={replacementDriveUrl}
                onChange={(event) => setReplacementDriveUrl(event.target.value)}
                placeholder="https://drive.google.com/file/d/…/view"
              />
              <p className="replacement-note">
                Antes de salvar, confirme no Drive que o acesso está definido como
                “Qualquer pessoa com o link”.
              </p>
              <p className="copy-message" role="status" aria-live="polite">
                {pageMessage}
              </p>
              <div className="dialog-actions">
                <button
                  type="button"
                  onClick={() => setReplaceWork(null)}
                  disabled={isReplacingAudio}
                >
                  Cancelar
                </button>
                <button type="submit" disabled={isReplacingAudio}>
                  {isReplacingAudio ? "Substituindo…" : "Confirmar substituição"}
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}
    </div>
  );
}
