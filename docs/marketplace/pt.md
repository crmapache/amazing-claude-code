# Amazing Claude Code GUI

**O Claude Code como um painel de chat dentro da sua IDE JetBrains.** Cartões no lugar da rolagem
do terminal, arquivos que você aponta em vez de caminhos que digita, e o seu código bem ao lado.

Ele usa o próprio CLI do Claude Code que já está na sua máquina, então sua conta, os modelos, os
comandos com barra, as regras de permissão, os servidores MCP e as skills vêm junto. Sem proxy no
meio e sem nenhuma conta nossa.

🌐 [English](en.md) | [简体中文](zh.md) | [Русский](ru.md) | [Українська](uk.md) | [Español](es.md) | **Português (Brasil)** | [Deutsch](de.md) | [Français](fr.md) | [日本語](ja.md) | [한국어](ko.md)

## Por que este

- **Uma rodada de trabalho, escrita uma vez e executada para você.** Cenários: um punhado de
  cartões, cada um com sua própria sessão do Claude - implementar, revisar, corrigir, rodar os
  testes - em etapas que podem se repetir mais de uma vez, com uma conversa principal acompanhando
  tudo e avaliando o que cada uma encontrou. Rode um pelo botão, três de uma vez contra três
  tickets, ou num horário marcado, às nove da manhã em todo dia útil, com as perguntas já
  respondidas de antemão. Descreva a rodada em uma frase e o Claude lê o projeto e escreve o
  formulário.
- **O painel inteiro a partir do seu celular, não só um botão de "sim".** Responda um pedido de
  permissão ou um plano, abra um projeto fechado, leia a conversa de ontem, ramifique, mude o
  modelo e o esforço, troque de conta, faça login em um conector, dite, acompanhe um cenário em
  execução e desbloqueie-o. Desligado por padrão, pareado por QR code, criptografado de ponta a
  ponta por um relay que não lê uma palavra sequer, revogável com um toque.
- **Várias contas do Claude, trocadas com um clique.** Trabalho e pessoal na mesma máquina, sem
  precisar sair de nenhuma das duas. Cada linha mostra o que resta da janela de cinco horas daquela
  conta e da semana dela, e Select move todas as conversas abertas para ela.
- **Busca em todas as conversas do projeto.** Prefixos, erros de digitação, radicais de palavras,
  frases entre aspas; nesta conversa ou em todas elas, com um salto direto até a mensagem, na
  conversa em que ela está. Quando as palavras não bastam, descreva o que você está procurando e o
  Claude lê as conversas para você.
- **Tudo o que ele faz fica na tela.** Cada chamada de ferramenta com a duração, cada edição como
  um diff já aberto, subagentes e frotas inteiras de agentes de workflow com a transcrição de cada
  agente a um clique de distância, a lista de tarefas sendo riscada, e quanto custou o turno. Uma
  API sobrecarregada ou limitada vira um cartão com o motivo e a contagem regressiva, não silêncio.
- **Nada responde por você, e nada se perde.** Uma permissão, um plano ou uma pergunta esperam o
  tempo que for preciso: sem prazo, sem continuação automática. As conversas continuam mesmo com o
  painel recolhido ou o projeto trocado, e as mensagens escritas durante um turno esperam numa fila
  que a IDE mantém.
- **Android Studio incluído**, junto com todas as IDEs JetBrains a partir da 2026.1.

## Como começar

1. Tenha o Claude Code instalado e funcionando no terminal: é esse CLI que o painel usa.
2. Abra o painel pelo botão na barra lateral. Se você ainda não fez login, um botão resolve isso
   no terminal da própria IDE.
3. Escreva sua mensagem: solte arquivos ou pastas no campo, `@` para um arquivo do projeto, `/`
   para um comando, `!` para rodar algo no seu shell.
4. Selecione um trecho no editor e escolha "Send to Amazing Claude Code GUI": vai uma referência
   exata de arquivo e linhas, não o texto colado.
5. Modelo, esforço e modo de permissão são os três botões abaixo do campo, e cada um pertence à
   aba que você está olhando.

## Também no painel

- **Aponte para os arquivos em vez de digitá-los.** Arraste um, digite `@` para escolher, cole uma
  captura de tela ou um log longo - cada um vira uma cápsula em que não dá para errar.
- **Mande o código com o endereço dele.** Selecione as linhas, "Send to Amazing Claude Code GUI", e
  o agente lê o arquivo de verdade em volta delas, não um trecho sem contexto.
- **Caminhos abrem arquivos.** Um caminho em qualquer lugar da conversa - o cabeçalho de um cartão,
  uma resposta, um erro, sua própria mensagem - abre o arquivo no editor na linha que ele indica;
  uma edição já abre na própria edição.
- **Pegue qualquer parte de uma resposta.** Cite-a na próxima mensagem, ramifique a conversa
  exatamente daquele ponto, fixe até três mensagens acima da conversa, ou traga uma mensagem
  enviada de volta para o campo, para corrigir e reenviar.
- **Modelo, esforço e modo mudam no meio da conversa**, cada aba por si, sem reiniciar nada. O que
  uma nova conversa usa de início é você quem decide, e um modelo do seu próprio servidor pode ser
  adicionado à mão.
- **Servidores MCP, plugins e marketplaces** em telas próprias: qual servidor está no ar, qual
  precisa de login, qual caiu e por quê.
- **Histórico** das conversas anteriores deste projeto, inclusive as que começaram no terminal,
  abertas pelo final e com as páginas mais antigas carregadas sob demanda.
- **Uma fila** para as mensagens escritas enquanto um turno roda, reordenável arrastando.
- **`!` roda um comando no seu próprio shell**, e a saída viaja com a sua próxima mensagem, sem
  custar um turno nem pedir permissão.
- **Melhorar o prompt**: a estrelinha reescreve seu rascunho em uma execução separada, sem gastar o
  contexto da conversa, e um botão traz de volta as suas palavras.
- **Ditado por voz** com a sua própria chave da Deepgram: segure um atalho, mesmo a partir do
  editor.
- **Avisos sonoros** para os sete momentos que merecem um, e só quando você já não está olhando.
- **Estatísticas** de horas, hábitos e conquistas, que dá para compartilhar como imagem.
- **Dez idiomas**, seguindo a sua IDE por padrão.
- **Seus buffers não salvos** são gravados antes de um turno, e os arquivos que o agente mudou são
  relidos na hora.
- **Um painel lateral, não uma aba do editor**, em qualquer borda da janela; números escolhem uma
  opção, Shift+Tab alterna o modo, Escape interrompe o turno.

## Privacidade e transparência

- **Tudo roda na sua máquina.** Sem proxy e sem nenhum servidor nosso no meio. Seu login no Claude
  pertence ao CLI: o plugin nunca o lê nem sai procurando chaves de API no seu disco.
- **Sem telemetria, sem analytics, sem conta.** Com o acesso remoto desligado, a única coisa que
  sai da máquina é um relatório de erro que você escreve e envia, e um botão mostra antes o texto
  exato dele.
- **Suas regras de permissão continuam suas.** O que perguntar é decidido pelo CLI, com as suas
  configurações, regras e hooks. O plugin não acrescenta hook nenhum e nunca inicia uma sessão em
  um modo mais frouxo do que o que está na tela.
- **Código disponível** no GitHub sob a Elastic License 2.0, e a
  [política de privacidade](https://relay.mzpizote.com/privacy) lista tudo o que pode sair da
  máquina.

## Requisitos

Claude Code instalado e logado, e qualquer IDE JetBrains a partir da 2026.1, incluindo o Android
Studio. O Android Studio não traz navegador embutido próprio, então a IDE oferece instalar o
plugin de navegador da JetBrains junto com este.

## Links

- [Código-fonte](https://github.com/crmapache/amazing-claude-code)
- [Relatar um problema ou pedir uma função](https://github.com/crmapache/amazing-claude-code/issues),
  ou use o formulário dentro do painel
- [Política de privacidade](https://relay.mzpizote.com/privacy)
