# psiu

Chat único em HTML, CSS e JavaScript com Express e Socket.IO.

## Executar

```sh
npm install
npm run dev
```

Abra http://localhost:3000 em duas abas para conversar. `npm start` executa sem
nodemon; `npm test` roda os testes com o executor nativo do Node.js (Node 18+).
É possível alterar a porta pela variável de ambiente `PORT`.

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
A autoria é comparada com a conexão atual; não há cadastro ou lista de contatos.
Acima de cada balão aparece o `senderId` completo do remetente, inclusive nas
mensagens próprias. Esse valor é o `socket.id` atribuído pelo Socket.IO à conexão
e pode mudar ao reconectar. Cada aba tem um ID diferente; não é um usuário
autenticado ou um identificador permanente. Mensagens já exibidas conservam o
ID da conexão que as enviou.
Enter envia, Shift+Enter quebra linha. O texto é preservado se o envio falhar.
Mensagens são renderizadas como texto, sem interpretar HTML.

Não há banco, histórico persistente ou recuperação de mensagens perdidas durante
desconexões. Todas as conexões compartilham a mesma conversa. A confirmação indica
que o servidor aceitou a mensagem, não que alguém a leu.
