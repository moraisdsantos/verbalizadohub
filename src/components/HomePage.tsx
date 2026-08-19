type HubModule = {
  code: string;
  title: string;
  description: string;
  icon: "audio" | "budget" | "contract" | "calendar" | "finance";
  status: "available" | "planned";
  href?: string;
};

const modules: HubModule[] = [
  {
    code: "01",
    title: "Catálogo de Audiodescrições",
    description:
      "Publique obras, gerencie os arquivos e gere o acesso individual por QR Code.",
    icon: "audio",
    status: "available",
    href: "#/catalogo",
  },
  {
    code: "02",
    title: "Clientes e Orçamentos",
    description:
      "Cadastre clientes, estruture propostas e transforme oportunidades em projetos.",
    icon: "budget",
    status: "available",
    href: "#/clientes",
  },
  {
    code: "03",
    title: "Contratos",
    description:
      "Gere, leia e acompanhe contratos integrados ao Google Drive.",
    icon: "contract",
    status: "planned",
  },
  {
    code: "04",
    title: "Visão de Projetos",
    description:
      "Visualize cronogramas, etapas, vigências, responsáveis e próximos passos.",
    icon: "calendar",
    status: "planned",
  },
  {
    code: "05",
    title: "Visão Financeira",
    description:
      "Acompanhe receitas, custos, liquidez e margem por período e projeto.",
    icon: "finance",
    status: "planned",
  },
];

function ModuleIcon({ name }: { name: HubModule["icon"] }) {
  const commonProps = {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };

  if (name === "audio") {
    return (
      <svg {...commonProps} aria-hidden="true">
        <path d="M4 10v4" />
        <path d="M8 7v10" />
        <path d="M12 4v16" />
        <path d="M16 7v10" />
        <path d="M20 10v4" />
      </svg>
    );
  }

  if (name === "budget") {
    return (
      <svg {...commonProps} aria-hidden="true">
        <path d="M4 7.5h14a2 2 0 0 1 2 2v8.5a2 2 0 0 1-2 2H5a3 3 0 0 1-3-3V6a2 2 0 0 1 2-2h12" />
        <path d="M16 12h4v4h-4a2 2 0 0 1 0-4Z" />
        <path d="M16 14h.01" />
      </svg>
    );
  }

  if (name === "contract") {
    return (
      <svg {...commonProps} aria-hidden="true">
        <path d="M6 2h8l4 4v16H6Z" />
        <path d="M14 2v5h5" />
        <path d="m9 15 2 2 4-5" />
      </svg>
    );
  }

  if (name === "calendar") {
    return (
      <svg {...commonProps} aria-hidden="true">
        <rect x="3" y="5" width="18" height="16" rx="2" />
        <path d="M16 3v4M8 3v4M3 10h18" />
        <path d="m8 15 2 2 5-5" />
      </svg>
    );
  }

  return (
    <svg {...commonProps} aria-hidden="true">
      <path d="M3 3v18h18" />
      <path d="m7 16 4-5 3 3 6-8" />
      <path d="M16 6h4v4" />
    </svg>
  );
}

function ModuleContent({ module }: { module: HubModule }) {
  return (
    <>
      <div className="hub-module-topline">
        <span className="hub-module-code">{module.code}</span>
        <span className={`hub-module-status ${module.status}`}>
          {module.status === "available" ? "Disponível" : "Em construção"}
        </span>
      </div>

      <div className="hub-module-icon" aria-hidden="true">
        <ModuleIcon name={module.icon} />
      </div>

      <div className="hub-module-copy">
        <h3>{module.title}</h3>
        <p>{module.description}</p>
      </div>

      <span className="hub-module-action" aria-hidden="true">
        {module.status === "available" ? "Acessar módulo  ↗" : "Planejado"}
      </span>
    </>
  );
}

type HomePageProps = {
  userEmail: string;
  onSignOut: () => void;
};

export default function HomePage({ userEmail, onSignOut }: HomePageProps) {
  const logoUrl = `${import.meta.env.BASE_URL}verbalizado-horizontal.png`;

  return (
    <div className="hub-home">
      <header className="hub-topbar">
        <span className="hub-product-label">Hub operacional</span>
        <div className="hub-account">
          <span>{userEmail}</span>
          <button type="button" onClick={onSignOut}>
            Sair
          </button>
        </div>
      </header>

      <main>
        <section
          className="hub-brand-hero"
          aria-label="ver.balizado — acessibilidade comunicacional"
        >
          <img className="hub-hero-logo" src={logoUrl} alt="" />
        </section>

        <section className="hub-modules" aria-labelledby="modules-title">
          <div className="hub-section-heading">
            <h2 id="modules-title">Por onde você quer começar?</h2>
          </div>

          <div className="hub-module-grid">
            {modules.map((module) =>
              module.href ? (
                <a
                  key={module.code}
                  className="hub-module-card is-available"
                  href={module.href}
                >
                  <ModuleContent module={module} />
                </a>
              ) : (
                <article key={module.code} className="hub-module-card is-planned">
                  <ModuleContent module={module} />
                </article>
              ),
            )}
          </div>
        </section>
      </main>

      <footer className="hub-footer">
        <span>ver.balizado</span>
        <span>Acessibilidade comunicacional</span>
      </footer>
    </div>
  );
}
