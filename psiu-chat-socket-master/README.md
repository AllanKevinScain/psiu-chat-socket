# psiu

Chat único em HTML, CSS e JavaScript com Express e Socket.IO.

## Executar

```sh
npm install
npm run dev
```

Abra http://localhost:3000 em duas abas para conversar. `npm start` executa sem
nodemon. Use Node.js 24, a mesma versão da imagem Docker. `npm test` roda
os testes com o executor nativo do Node.js.
É possível alterar a porta pela variável de ambiente `PORT`.

## Duas réplicas com Docker Compose

```sh
docker compose up --build -d
```

Abra http://127.0.0.1:8080. O HAProxy encaminha para duas réplicas da mesma
imagem. A afinidade por cookie mantém as requisições do polling no mesmo
servidor durante a conexão. O proxy usa `GET /healthz` para retirar e readmitir
réplicas. Esse endpoint retorna 503 quando algum cliente Redis da réplica
está indisponível.

O Redis do Compose fica numa rede privada, com volume e AOF. O proxy é o
único serviço com porta publicada, vinculada ao loopback para o teste local.
Para personalizar a porta ou apontar para um Redis externo acessível pelas
réplicas, copie `.env.example` para `.env` e ajuste `PUBLIC_PORT` e
`REDIS_URL`. Mantenha as credenciais nesse arquivo local. Fora do Compose,
passe `REDIS_URL` pelo ambiente para ativar o modo distribuído.

```sh
npm install
npm run test:failover
```

Execute o teste com o Compose de desenvolvimento e seu Redis interno em execução. Ele conecta
dois clientes via polling em réplicas distintas, troca mensagens nos dois
sentidos, para A, verifica a reconexão e o histórico em B e reinicia A para
verificar sua volta ao balanceamento. Se você definiu `PUBLIC_PORT` no
`.env`, exporte o mesmo valor no ambiente antes de rodar o teste.

Esse cenário verifica a falha de um contêiner. Para testar a queda de uma
máquina, coloque as réplicas em hosts distintos e mantenha o proxy e o Redis
acessíveis a partir de ambos após a perda de qualquer host. Aponte o domínio
para o proxy com HTTPS e configure os endereços privados de A e B no lugar
dos nomes do Compose. Um proxy único e um Redis único são pontos de falha.

## Organização

- `index.html`: marcação e importação do cliente Socket.IO e `/js/main.js`.
- `styles.css`: apresentação visual.
- `index.js`: inicialização do servidor.
- `src/server/domain/message.js`: regras e criação de mensagens.
- `src/server/application/publish-message.js`: caso de uso; recebe as portas
  `broadcaster.publish(message)` e `generateId()` por injeção de dependências.
- `src/server/infrastructure/socket-chat.js`: adapta eventos Socket.IO ao caso de uso.
- `src/server/create-chat-server.js`: configura HTTP e conecta as dependências.
- `src/client/application/chat-controller.js`: coordena envio e recebimento usando
  os contratos `view` e `gateway`, sem depender do DOM ou Socket.IO.
- `src/client/infrastructure/socket-chat-gateway.js`: transporte e confirmação de envio.
- `src/client/presentation/chat-view.js`: formulário, balões e avisos no DOM.
- `src/client/main.js`: conecta as implementações do navegador.

As dependências apontam para as regras e casos de uso. As portas são contratos
documentados em JavaScript, sem classes base artificiais. Cada módulo tem uma
responsabilidade; trocar a interface ou transporte não exige alterar as regras.
O cliente usa módulos ES nativos, e o servidor mantém CommonJS.

## Comunicação

O cliente emite `chat message` com o texto. O servidor valida o tipo, remove espaços
das extremidades e aceita de 1 a 4000 caracteres. Ele gera `{ id, text, senderId }`,
transmite para todos (incluindo o remetente) e confirma com `{ ok: true }`.
Conteúdo inválido recebe `{ ok: false, error }` e não é transmitido.

Os balões são inseridos apenas no recebimento, evitando duplicação no remetente.
Acima de cada balão aparece o `senderId` do remetente. No modo local sem
Redis, ele é o ID da conexão Socket.IO. No modo distribuído, o servidor gera
um ID público de sessão e uma credencial separada. O navegador guarda a
credencial em `sessionStorage` e a reapresenta ao reconectar. A sessão é
anônima e expira após 24 horas sem renovação.
Enter envia, Shift+Enter quebra linha. O texto é preservado se o envio falhar.
Mensagens são renderizadas como texto, sem interpretar HTML.

Todas as conexões compartilham a sala global. No modo distribuído, o Redis
Adapter encaminha os eventos ao vivo e o servidor guarda separadamente as
últimas 100 mensagens, as sessões e a presença. Cada conexão renova a presença
a cada 10 segundos, com expiração em 30 segundos caso a réplica caia.
Ao reconectar, o cliente volta à sala e combina o histórico recente com os
eventos ao vivo pelo ID da mensagem. A confirmação indica que o servidor
aceitou a mensagem. O modo local sem Redis só entrega as mensagens ao vivo.
