# Player de audiodescrições ver.balizado

Aplicação em React + TypeScript + Vite, com catálogo persistente no Supabase e publicação automática no GitHub Pages.

## O que o projeto faz

- armazena vários links públicos do Google Drive no Supabase;
- consulta automaticamente o nome original do arquivo de áudio;
- exibe um catálogo público das obras publicadas;
- protege inclusão, edição e exclusão por login com e-mail e senha;
- gera link e QR Code exclusivos para cada obra;
- abre, pelo QR Code, uma página com somente o player daquela audiodescrição;
- permite publicar, ocultar e remover obras;
- oferece velocidades de reprodução de 1x, 1.5x e 2x.
- cadastra clientes com dados comerciais e de contato;
- cria propostas vinculadas a cada cliente;
- permite adicionar serviços com quantidade opcional e preço unitário;
- calcula desconto, impostos e valor total;
- permite visualizar, editar, remover e exportar propostas em PDF pelo navegador.
- cadastra contratos por leitura de PDF, a partir de uma proposta ou manualmente;
- cria um projeto para cada contrato;
- usa a OpenAI para extrair dados de contratos em PDF, sempre com revisão humana;
- armazena os arquivos de contrato no Google Drive e somente os metadados no Supabase.
- acompanha projetos em uma linha do tempo semanal com escalas mensal, trimestral e anual;
- permite criar e atualizar etapas, registrar ações com responsáveis e prazos;
- registra custos por projeto e calcula saldo e margem a partir do contrato.

## Ativar Clientes e Propostas

No painel do Supabase, abra **SQL Editor → New query**, copie o conteúdo de
`supabase/migrations/20260819190000_create_clients_and_proposals.sql` e execute.

A migração cria as tabelas `clients`, `proposals` e `proposal_items`. Os dados são
restritos aos usuários autenticados do hub e não ficam disponíveis para visitantes.

Depois da migração, o cartão **Clientes e Orçamentos** ficará disponível na página
inicial. Na visualização de uma proposta, o botão **Exportar / salvar PDF** abre a
impressão do navegador; selecione **Salvar como PDF** para gerar o arquivo.

## Ativar Contratos e Projetos

No **SQL Editor** do Supabase, execute também:

`supabase/migrations/20260819223000_create_projects_and_contracts.sql`

Essa migração cria `projects` e `contracts`. A tabela `contracts` não guarda o PDF
nem o conteúdo integral do documento: ela guarda apenas os campos operacionais e o
link/identificador do arquivo no Google Drive.

### 1. Preparar o Google Drive para gravação

A chave simples da Google Drive API usada pelo catálogo permite consultar arquivos
públicos, mas não permite criar contratos. Para gravar na pasta da empresa, configure
OAuth 2.0 para a conta proprietária do Drive:

1. habilite a **Google Drive API** no Google Cloud;
2. crie um cliente OAuth 2.0;
3. autorize essa conta com o escopo `https://www.googleapis.com/auth/drive.file`;
4. obtenha um refresh token;
5. crie no Drive uma pasta exclusiva para contratos e copie o ID da URL.

Em um Google Workspace com Drive compartilhado, também é possível usar uma conta de
serviço e compartilhar a pasta com o e-mail dessa conta. Para uma pasta comum do
**Meu Drive**, prefira OAuth, pois o arquivo será criado pela própria conta da empresa.

### 2. Configurar OpenAI e Drive na Edge Function

Copie `supabase/.env.functions.example` para `supabase/.env.functions`, preencha sem
versionar esse arquivo e envie os segredos:

```bash
npx supabase secrets set --env-file supabase/.env.functions
npx supabase functions deploy contract-ai --no-verify-jwt
```

Se a CLI não funcionar no seu ambiente, crie os mesmos segredos em **Supabase → Edge
Functions → Secrets** e faça o deploy do conteúdo de
`supabase/functions/contract-ai/index.ts`. Na função, deixe desativada a opção
**Verify JWT with legacy secret**; o próprio código valida a sessão do usuário.

Use `OPENAI_API_KEY` somente na Edge Function. Nunca crie uma variável
`VITE_OPENAI_API_KEY`, pois tudo que começa com `VITE_` é enviado ao navegador.

### 3. Como funcionam os três fluxos

- **PDF:** a OpenAI extrai os campos; o gestor revisa, escolhe o cliente e informa o
  nome do projeto; ao confirmar, o PDF original vai para o Drive.
- **Proposta:** cliente, serviços, valor e pagamento vêm do orçamento; o backend
  aplica esses dados ao modelo fixo da ver.balizado e cria um Google Docs na pasta.
- **Manual:** o gestor preenche os mesmos campos e o backend cria o documento usando
  o modelo fixo.

Em todos os casos, o projeto só é criado depois da confirmação. Se a gravação no
Supabase falhar, o aplicativo tenta remover do Drive o arquivo recém-criado para não
deixar documentos órfãos.

## Ativar a Visão de Projetos

Depois de criar as tabelas de projetos e contratos, execute no **SQL Editor**:

`supabase/migrations/20260819233000_create_project_management.sql`

Essa migração cria:

- `project_stages`, para as barras do cronograma;
- `project_actions`, para os próximos passos e prazos;
- `project_costs`, para custos previstos e pagos.

O cartão **Visão de Projetos** passa a abrir `#/projetos`. Cada projeto gerado por
um contrato apresenta o cliente, a vigência, o link do documento no Google Drive,
o valor contratado, os custos e o saldo projetado. Caso ainda não existam etapas,
o botão **Criar etapas padrão** gera uma estrutura inicial que pode ser editada.

## Arquitetura

- **GitHub Pages:** hospeda a interface estática compilada pelo Vite.
- **Supabase Database:** armazena os registros das audiodescrições.
- **Supabase Auth:** restringe a área administrativa a usuários previamente autorizados.
- **Supabase Edge Function:** consulta o nome e o tipo do arquivo no Google Drive sem expor a chave da API do Google.
- **Supabase Edge Function `contract-ai`:** mantém as chaves da OpenAI e do Google Drive no servidor, interpreta PDFs e cria documentos a partir do modelo.
- **QR Code:** gerado localmente no navegador; nenhum link é enviado a um serviço externo de QR Code.

## 1. Criar e configurar o projeto Supabase

Crie um projeto no Supabase. Em seguida, aplique a migração:

```bash
npx supabase login
npx supabase link --project-ref SEU_PROJECT_REF
npx supabase db push
```

Como alternativa, copie o conteúdo de `supabase/migrations/20260817180000_create_audio_works.sql` para o SQL Editor do Supabase e execute-o. Em projetos nos quais a tabela já existe, execute também `supabase/migrations/20260819173000_repair_catalog_permissions.sql`. Essa segunda migração reaplica as permissões de inclusão, edição e exclusão para usuários autenticados.

A migração:

- cria a tabela `audio_works`;
- habilita Row Level Security;
- permite leitura anônima apenas de obras publicadas;
- permite que usuários autenticados gerenciem o catálogo;
- concede explicitamente ao Data API apenas as permissões necessárias.

## 2. Autorizar os administradores

No painel do Supabase, abra **Authentication → Users** e crie os usuários que poderão gerenciar o catálogo. Cada administrador precisa ter um e-mail e uma senha definidos no Supabase Auth. Confirme também que o e-mail do usuário aparece como verificado; contas ainda não confirmadas podem não conseguir entrar.

O aplicativo não oferece cadastro público nem recuperação de senha. Em **Authentication → Sign In / Providers → Email**, mantenha o provedor de e-mail habilitado e desative **Allow new users to sign up**. Assim, somente usuários criados por você no painel poderão entrar.

O login é feito diretamente com `signInWithPassword`, sem envio de link mágico e sem dependência do serviço de e-mail do Supabase.

## 3. Configurar a consulta de nomes no Google Drive

No Google Cloud:

1. crie ou escolha um projeto;
2. habilite a **Google Drive API**;
3. crie uma chave de API;
4. restrinja a chave somente à Google Drive API.

Salve a chave como segredo da Edge Function:

```bash
npx supabase secrets set GOOGLE_DRIVE_API_KEY=SUA_CHAVE
npx supabase functions deploy drive-metadata --no-verify-jwt
npx supabase functions deploy audio-stream --no-verify-jwt
```

O parâmetro `--no-verify-jwt` desativa apenas a validação antiga do gateway, que não
aceita alguns tokens ES256 emitidos pelos projetos atuais. A própria função continua
exigindo e validando a sessão autenticada antes de consultar o Google Drive.

Se você estiver usando o painel em vez da CLI, abra **Edge Functions → drive-metadata**, substitua o código pelo arquivo `supabase/functions/drive-metadata/index.ts` e faça o deploy. Nas configurações da função, deixe desativada a opção **Verify JWT with legacy secret**. A validação do usuário é feita dentro da própria função por meio do Supabase Auth.

Os arquivos de áudio precisam estar compartilhados no Drive como **Qualquer pessoa com o link**.

A função `audio-stream` retransmite o arquivo público do Drive com os cabeçalhos
necessários para o player funcionar tanto no preview do Vite quanto no GitHub
Pages. Ela também encaminha requisições `Range`, usadas para avançar e retroceder
na faixa.

## 4. Configurar o ambiente local

O projeto já inclui um arquivo `.env` com a URL e a chave publicável do
Supabase. Portanto, ao abrir ou importar o projeto, não é necessário recriar
`.env.local`.

Se futuramente você trocar de projeto Supabase, edite o arquivo `.env`:

```env
VITE_SUPABASE_URL=https://SEU-PROJETO.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_SUA_CHAVE
VITE_CONTACT_URL=https://SEU-LINK-DE-CONTATO
```

Não é necessário criar `.env.local`. Se esse arquivo existir, apague-o: ele tem
prioridade e pode sobrescrever o `.env` com valores antigos. Use apenas a chave
publicável no navegador. Nunca coloque uma chave secreta ou `service_role` em
variáveis iniciadas por `VITE_`. Após alterar o `.env`, encerre e reinicie o Vite.

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
  components/ClientsPage.tsx
  components/ContractsPage.tsx
  components/ProjectsPage.tsx
  components/ProposalPreview.tsx
  components/QrDialog.tsx
  lib/drive.ts
  lib/supabase.ts
  App.tsx
  styles.css
supabase/
  functions/drive-metadata/index.ts
  functions/contract-ai/index.ts
  migrations/20260817180000_create_audio_works.sql
  migrations/20260819173000_repair_catalog_permissions.sql
  migrations/20260819223000_create_projects_and_contracts.sql
  migrations/20260819233000_create_project_management.sql
.github/workflows/deploy-pages.yml
```
