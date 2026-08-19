import type { FormEvent } from "react";

type HubLoginProps = {
  email: string;
  password: string;
  message: string;
  isSubmitting: boolean;
  onEmailChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
};

const logoUrl = `${import.meta.env.BASE_URL}verbalizado-horizontal.png`;

export function HubAccessLoading() {
  return (
    <main className="hub-access-screen" aria-busy="true">
      <div className="hub-access-loading">
        <img
          className="hub-access-logo"
          src={logoUrl}
          alt="ver.balizado — acessibilidade comunicacional"
        />
        <p role="status">Verificando acesso…</p>
      </div>
    </main>
  );
}

export default function HubLogin({
  email,
  password,
  message,
  isSubmitting,
  onEmailChange,
  onPasswordChange,
  onSubmit,
}: HubLoginProps) {
  return (
    <main className="hub-access-screen">
      <div className="hub-access-card">
        <img
          className="hub-access-logo"
          src={logoUrl}
          alt="ver.balizado — acessibilidade comunicacional"
        />

        <section className="login-panel hub-login-panel" aria-labelledby="hub-login-title">
          <div>
            <p className="section-eyebrow">Acesso restrito</p>
            <h1 id="hub-login-title">Entrar no hub</h1>
            <p>
              Use o mesmo e-mail e a mesma senha cadastrados no Supabase Auth.
            </p>
          </div>

          <form className="login-form" onSubmit={onSubmit}>
            <div className="login-fields">
              <div>
                <label htmlFor="hub-email">E-mail</label>
                <input
                  id="hub-email"
                  type="email"
                  autoComplete="username"
                  required
                  value={email}
                  onChange={(event) => onEmailChange(event.target.value)}
                  placeholder="voce@verbalizado.com.br"
                />
              </div>
              <div>
                <label htmlFor="hub-password">Senha</label>
                <input
                  id="hub-password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(event) => onPasswordChange(event.target.value)}
                  placeholder="Sua senha"
                />
              </div>
            </div>
            <button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Entrando…" : "Entrar"}
            </button>
            <p className="form-message" role="status" aria-live="polite">
              {message}
            </p>
          </form>
        </section>
      </div>
    </main>
  );
}
