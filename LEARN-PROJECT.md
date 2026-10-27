# Entendendo o projeto psiu

O psiu é um chat único. O navegador mostra a interface e o servidor distribui as mensagens usando Socket.IO. A organização separa regras, coordenação, comunicação e apresentação.

## Como executar e acompanhar

```sh
npm install
npm run dev
```

Abra `http://localhost:3000` em duas abas. Envie uma mensagem em uma delas e acompanhe seu recebimento nas duas.

Os caminhos deste documento partem da raiz do projeto. Procure pelos nomes das funções no editor: eles continuam úteis mesmo quando as linhas mudarem.

## Primeiro: como o projeto começa

Há duas inicializações: a do servidor e a de cada página aberta no navegador.

### Inicialização do servidor

```text
index.js
  → createChatServer() em src/server/create-chat-server.js
  → configura Express, HTTP e Socket.IO
  → conecta publishMessage ao transmissor Socket.IO
  → registerSocketChat() registra os eventos de conexão e mensagem
  → server.listen() começa a aceitar conexões
```

`createChatServer()` monta as dependências. O caso de uso recebe um transmissor (`broadcaster`) e um gerador de IDs (`generateId`), em vez de criar essas ferramentas internamente.

### Inicialização do navegador

```text
GET / → index.html
  → styles.css
  → /socket.io/socket.io.js (biblioteca fornecida pelo servidor Socket.IO)
  → /js/main.js (arquivo real: src/client/main.js)
  → importa controlador, gateway e view
  → cria a conexão com window.io()
  → chat.start() registra os comportamentos da tela
```

O endereço `/js/main.js` funciona por causa desta configuração em `src/server/create-chat-server.js`:

```js
app.use("/js", express.static(join(root, "src/client")));
```

Ela associa o endereço público `/js` à pasta física `src/client`. Essa configuração fica no servidor, não em `src/client/main.js`.

Uma nova aba cria uma nova conexão com o servidor existente. O servidor não é recriado a cada acesso. Em `src/server/infrastructure/socket-chat.js`, o evento `connection` recebe essa conexão em `socket`. Seu identificador é `socket.id`; ele pode mudar quando a conexão é refeita.

## 1. Envio de texto

Para estudar o envio, siga esta ordem:

| Etapa | Arquivo | O que procurar |
| --- | --- | --- |
| 1 | `index.html` | Formulário `composer`, campo `message-input` e botão de envio. |
| 2 | `src/client/presentation/chat-view.js` | `onSubmit()` captura o envio do formulário. Enter envia; Shift+Enter permite quebra de linha. |
| 3 | `src/client/application/chat-controller.js` | `sendMessage()` lê o campo usando `view.getText()`, remove espaços das extremidades e ignora texto vazio. |
| 4 | `src/client/infrastructure/socket-chat-gateway.js` | `send(text)` verifica a conexão e emite o evento `chat message`. |
| 5 | `src/server/infrastructure/socket-chat.js` | `socket.on("chat message", ...)` recebe o texto e chama `publishMessage`, usando `socket.id` como autoria. |
| 6 | `src/server/application/publish-message.js` | O caso de uso chama `createMessage()` e depois `broadcaster.publish(message)`. |
| 7 | `src/server/domain/message.js` | `createMessage()` valida texto e remetente, limita o conteúdo a 4000 caracteres e cria o objeto com um ID gerado no servidor. |
| 8 | `src/server/infrastructure/socket-chat.js` | O transmissor usa `io.emit("chat message", message)` para distribuir o objeto a todas as conexões, inclusive a de quem enviou. |

O caminho completo é:

```text
Campo → view → controlador → gateway → Socket.IO
  → adaptador do servidor → caso de uso → regras da mensagem
  → transmissor → todos os navegadores conectados
```

O servidor transforma um texto como `"  Olá!  "` em um objeto como:

```js
{
  id: "identificador-gerado-no-servidor",
  text: "Olá!",
  senderId: "identificador-da-conexao"
}
```

O cliente envia apenas o texto. O servidor determina o remetente a partir da conexão, em vez de confiar em um ID informado pelo navegador.

### Confirmação e falha no envio

Depois de publicar, o adaptador do servidor responde com `reply({ ok: true })`. Se a validação falhar, responde com `{ ok: false, error }` e não transmite a mensagem.

O gateway espera essa resposta por até oito segundos. Enquanto espera, o controlador desabilita o campo e o botão para evitar envios simultâneos. Em caso de sucesso, limpa o campo; em caso de erro, preserva o texto e mostra um aviso. No final, libera o formulário.

Essa confirmação significa que o servidor aceitou o envio. Não é uma confirmação de leitura ou de que todos os destinatários receberam a mensagem. Se o prazo acabar, o envio pode ter ocorrido sem que a confirmação tenha chegado; por isso o aviso pede para conferir a conversa antes de tentar novamente.

## 2. Visualização de texto

O recebimento tem seu próprio caminho. Tanto quem enviou quanto as outras pessoas recebem o evento do servidor:

```text
Servidor: io.emit("chat message", message)
  → cliente: gateway.onMessage()
  → controlador: view.addMessage(message)
  → view: cria os elementos do balão
  → styles.css: define aparência e alinhamento
```

Leia estes pontos:

1. Em `src/client/infrastructure/socket-chat-gateway.js`, `onMessage(handler)` registra `socket.on("chat message", ...)`.
2. O gateway compara `message.senderId` com `socket.id` e adiciona a propriedade `mine`. Ela indica se a mensagem foi enviada pela conexão atual.
3. Em `src/client/application/chat-controller.js`, `start()` liga o recebimento à interface: `gateway.onMessage(message => view.addMessage(message))`.
4. Em `src/client/presentation/chat-view.js`, `addMessage({ text, mine, senderId })` cria os elementos `.message`, `.bubble-wrap`, `.message-sender` e `.bubble`. O elemento `.message-sender` recebe o `senderId` completo como texto e aparece acima do balão. A classe `.mine` também alinha o identificador próprio à direita.
5. A linha `bubble.textContent = text` insere o conteúdo como texto. Um texto contendo tags HTML aparece como texto, sem virar marcação executável.
6. A classe `.mine` posiciona a mensagem própria à direita, conforme `styles.css`.
7. `messages.scrollTop = messages.scrollHeight` rola o painel de mensagens até o final.

O envio não adiciona um balão imediatamente. O balão aparece quando o evento retorna do servidor. Assim, a mensagem própria não é mostrada duas vezes por causa de uma inserção local seguida do recebimento.

Acima de cada mensagem é exibido o identificador da conexão que a enviou (`senderId`), inclusive nas mensagens próprias. O caminho desse dado é: `socket.id` no servidor → `createMessage()` → transmissão por Socket.IO → gateway do cliente → controlador → `view.addMessage()` → `.message-sender`. Não são exibidos nomes, horários ou ícones de leitura, e não há lista de contatos. O ID identifica a conexão, pode mudar ao reconectar e é diferente em cada aba. Mensagens já exibidas mantêm o ID original de envio.

## 3. Carregamento de texto

Aqui precisamos distinguir o conteúdo digitado, o recebido em tempo real e um possível histórico.

### Texto digitado no campo

Ele fica no elemento `textarea` do navegador. `view.getText()` lê `input.value` quando o formulário é enviado. O texto só sai do navegador quando o gateway emite a mensagem.

### Mensagens recebidas com a página aberta

São carregadas pelo evento Socket.IO e exibidas no fluxo de visualização descrito acima. O projeto não faz uma consulta HTTP para buscar cada mensagem.

### Histórico ao abrir ou atualizar a página

**Ainda não existe carregamento de histórico.** O painel começa vazio porque não há banco de dados, repositório de mensagens ou leitura de armazenamento local neste fluxo.

`publishMessage()` valida e transmite a mensagem; ele não a guarda. Os balões ficam no DOM de cada página enquanto ela está aberta. Ao atualizar, eles são perdidos. Uma aba que entra depois não recebe mensagens anteriores. Mensagens enviadas por outras pessoas durante uma desconexão também não são recuperadas automaticamente pela implementação atual.

Se adicionarmos histórico no futuro, o caminho poderá ser:

```text
Publicar mensagem
  → validar
  → salvar por uma porta de repositório
  → transmitir

Abrir a conversa
  → solicitar histórico ao servidor
  → caso de uso consulta o repositório
  → servidor devolve as mensagens
  → cliente encaminha para a view
```

Esse é um desenho futuro, não um comportamento já implementado. A combinação de histórico e eventos em tempo real também precisará usar o ID da mensagem para evitar duplicações e definir a ordem de exibição.

## 4. Por que separar server e client?

Eles executam em ambientes diferentes e têm responsabilidades diferentes:

| Client: navegador de cada pessoa | Server: processo Node.js compartilhado |
| --- | --- |
| Captura cliques, teclado e o texto digitado. | Aceita conexões e recebe eventos. |
| Monta os balões no DOM e aplica o CSS. | Valida as mensagens antes de distribuí-las. |
| Envia eventos e exibe mensagens recebidas. | Gera IDs e obtém o remetente da conexão. |
| Pode ser alterado por quem usa o navegador. | Deve aplicar as regras mesmo que alguém contorne a interface. |
| Recebe os módulos públicos em `/js`. | Mantém o código de servidor fora da pasta pública. |

Por exemplo, `maxlength="4000"` ajuda na interface, mas alguém pode enviar um evento sem usar o formulário. A regra em `src/server/domain/message.js` continua necessária para recusar esse conteúdo.

O servidor não manipula o DOM da pessoa; ele envia dados. O navegador não distribui diretamente mensagens para todas as outras conexões; ele pede ao servidor para fazer isso.

`socket.id` identifica uma conexão, não uma conta autenticada. Duas abas da mesma pessoa têm IDs diferentes.

### Como essa separação se relaciona com SOLID e Clean Architecture

Separar as pastas `server` e `client` define onde o código executa. Dentro delas, as camadas definem a responsabilidade de cada arquivo:

- **Domínio:** regras da mensagem, sem depender de Express, Socket.IO ou DOM.
- **Aplicação:** coordena ações usando contratos pequenos recebidos como dependências.
- **Infraestrutura:** implementa a comunicação usando Socket.IO.
- **Apresentação:** manipula o formulário e os balões no navegador.
- **Composição:** `create-chat-server.js` e `main.js` conectam as implementações concretas.

O controlador recebe `view` e `gateway`; o caso de uso de publicação recebe `broadcaster` e `generateId`. Isso aplica inversão de dependência: as ações principais não precisam importar as ferramentas concretas de comunicação e interface.

Não é necessário ter todas as camadas em ambos os lados: atualmente o domínio da mensagem está no servidor, onde a validação definitiva acontece. Também não é necessário criar uma classe para cada função. Os contratos são os métodos que cada dependência precisa oferecer.

Essa organização permite testar as regras e o controlador com dependências substitutas. Uma troca de transporte pode ser feita no adaptador sem reescrever as regras de conteúdo, desde que preserve o contrato e os comportamentos esperados.

## Roteiro de leitura e exercício

Siga nesta ordem:

1. `index.js` e `src/server/create-chat-server.js`: como o servidor é montado e como os arquivos chegam ao navegador.
2. `index.html` e `src/client/main.js`: como a interface inicia.
3. `src/client/presentation/chat-view.js`: onde o clique vira uma ação e os dados viram balões.
4. `src/client/application/chat-controller.js`: como a ação é coordenada.
5. `src/client/infrastructure/socket-chat-gateway.js`: como os dados cruzam a conexão.
6. `src/server/infrastructure/socket-chat.js`: como o servidor recebe e transmite eventos.
7. `src/server/application/publish-message.js` e `src/server/domain/message.js`: como as regras são aplicadas.
8. `test/chat.test.js`: quais comportamentos são verificados. Execute `npm test`.

Para acompanhar na prática, coloque breakpoints em `sendMessage()`, `gateway.send()`, no evento `chat message` do servidor, em `createMessage()` e em `view.addMessage()`. Os breakpoints do cliente ficam nas ferramentas do navegador; os do servidor, no depurador Node.js do editor.
