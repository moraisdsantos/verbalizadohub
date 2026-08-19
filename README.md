# Player de audiodescrições ver.balizado

Aplicação em React + TypeScript + Vite, com catálogo persistente no Supabase e publicação automática no GitHub Pages.

## O que o projeto faz

- armazena vários links públicos do Google Drive no Supabase;
- consulta automaticamente o nome original do arquivo de áudio;
- exibe um catálogo público das obras publicadas;
- protege inclusão, edição e exclusão por login com link mágico;
- gera link e QR Code exclusivos para cada obra;
- abre, pelo QR Code, uma página com somente o player daquela audiodescrição;
- permite publicar, ocultar e remover obras;
- oferece velocidades de reprodução de 1x, 1.5x e 2x.

## Arquitetura

- **GitHub Pages:** hospeda a interface estática compilada pelo Vite.
- **Supabase Database:** armazena os registros das audiodescrições.
- **Supabase Auth:** restringe a área administrativa a usuários previamente autorizados.
- **Supabase Edge Function:** consulta o nome e o tipo do arquivo no Google Drive sem expor a chave da API do Google.
- **QR Code:** gerado localmente no navegador; nenhum link é enviado a um serviço externo de QR Code.

## 1. Criar e configurar o projeto Supabase

Crie um projeto no Supabase. Em seguida, aplique a migração:

```bash
npx supabase login
npx supabase link --project-ref SEU_PROJECT_REF
npx supabase db push
```

Como alternativa, copie o conteúdo de `supabase/migrations/20260817180000_create_audio_works.sql` para o SQL Editor do Supabase e execute-o.

A migração:

- cria a tabela `audio_works`;
- habilita Row Level Security;
- permite leitura anônima apenas de obras publicadas;
- permite que usuários autenticados gerenciem o catálogo;
- concede explicitamente ao Data API apenas as permissões necessárias.

## 2. Autorizar os administradores

No painel do Supabase, abra **Authentication → Users** e convide ou crie os usuários que poderão gerenciar o catálogo.

O aplicativo utiliza `shouldCreateUser: false`: um visitante não consegue criar uma conta apenas informando um e-mail. Somente usuários já existentes no Supabase recebem acesso.

Em **Authentication → URL Configuration**:

- defina **Site URL** como o endereço final do GitHub Pages;
- adicione o mesmo endereço em **Redirect URLs**;
- durante o desenvolvimento, adicione também `http://localhost:5173`.

## 3. Configurar a consulta de nomes no Google Drive

No Google Cloud:

1. crie ou escolha um projeto;
2. habilite a **Google Drive API**;
3. crie uma chave de API;
4. restrinja a chave somente à Google Drive API.

Salve a chave como segredo da Edge Function:

```bash
npx supabase secrets set GOOGLE_DRIVE_API_KEY=SUA_CHAVE
npx supabase secrets set ALLOWED_ORIGIN=https://SEU-USUARIO.github.io
npx supabase functions deploy drive-metadata
```

Para aceitar mais de uma origem, separe os endereços de `ALLOWED_ORIGIN` por vírgula.

Os arquivos de áudio precisam estar compartilhados no Drive como **Qualquer pessoa com o link**.

## 4. Configurar o ambiente local

Copie `.env.example` para `.env.local` e preencha:

```env
VITE_SUPABASE_URL=https://SEU-PROJETO.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_SUA_CHAVE
VITE_CONTACT_URL=https://SEU-LINK-DE-CONTATO
```

Use apenas a chave publicável no navegador. Nunca coloque uma chave secreta ou `service_role` em variáveis iniciadas por `VITE_`.

Instale e execute:

```bash
npm install
npm run dev
```

Validação de produção:

```bash
npm run build
```

## 5. Publicar no GitHub Pages

Crie um repositório e envie o conteúdo deste projeto. No GitHub:

1. abra **Settings → Secrets and variables → Actions**;
2. crie os secrets `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY`;
3. se desejar ativar o contato, adicione `VITE_CONTACT_URL` ao workflow ou diretamente ao ambiente de build;
4. abra **Settings → Pages**;
5. em **Build and deployment**, selecione **GitHub Actions**;
6. envie uma alteração para a branch `main`.

O workflow `.github/workflows/deploy-pages.yml` compila e publica automaticamente o diretório `dist`.

## Link individual e QR Code

Cada obra publicada recebe uma URL neste formato:

```text
https://SEU-USUARIO.github.io/SEU-REPOSITORIO/?obra=UUID-DA-OBRA
```

Essa URL consulta somente o registro publicado correspondente e não renderiza o catálogo nem a área administrativa.

## Estrutura principal

```text
src/
  components/AudioPlayer.tsx
  components/QrDialog.tsx
  lib/drive.ts
  lib/supabase.ts
  App.tsx
  styles.css
supabase/
  functions/drive-metadata/index.ts
  migrations/20260817180000_create_audio_works.sql
.github/workflows/deploy-pages.yml
```
