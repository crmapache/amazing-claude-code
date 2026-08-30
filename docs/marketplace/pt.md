# Amazing Claude Code GUI

**O Claude Code como um painel de chat dentro da sua IDE JetBrains.** Cartões no lugar da rolagem
do terminal, arquivos que você aponta em vez de caminhos que digita, e o seu código bem ao lado.

Ele usa o próprio CLI do Claude Code que já está na sua máquina, então sua conta, os modelos, os
comandos com barra, as regras de permissão, os servidores MCP e as skills vêm junto. Sem proxy no
meio e sem nenhuma conta nossa.

🌐 [English](en.md) | [简体中文](zh.md) | [Русский](ru.md) | [Español](es.md) | **Português (Brasil)** | [Deutsch](de.md) | [Français](fr.md) | [日本語](ja.md) | [한국어](ko.md)

## Por que este

- **Aponte para os arquivos em vez de digitá-los.** Arraste um, digite `@` para escolher, cole uma
  captura de tela: cada um entra como uma cápsula em que não dá para errar.
- **Mande o código com o endereço dele.** Selecione as linhas, "Send to Amazing Claude Code GUI",
  e o agente lê o arquivo de verdade em volta delas, não um trecho sem contexto.
- **Qualquer parte de uma resposta vira alça.** Cite-a na próxima mensagem ou ramifique a conversa
  exatamente naquele ponto: a original continua como estava.
- **Você vê o que está acontecendo.** Chamadas de ferramenta com a duração, diffs com os números,
  a lista de tarefas sendo riscada, planos, subagentes, frotas inteiras de agentes dentro de uma
  única chamada de workflow, e quanto custou o turno.
- **Nenhum silêncio inexplicável.** Uma API sobrecarregada ou limitada vira um cartão com o
  motivo, o número da tentativa e a contagem regressiva.
- **Ninguém responde por você.** Um pedido de permissão, um plano ou uma pergunta esperam o tempo
  que for preciso: sem prazo e sem continuação automática.
- **Um painel lateral, não uma aba do editor**, em qualquer borda da janela.
- **As conversas sobrevivem ao painel.** Recolha, troque de projeto, volte: o agente continuou
  trabalhando e as mensagens na fila continuam na fila.
- **Modelo, esforço e modo mudam no meio da conversa**, cada aba por si, sem reiniciar nada.
- **Responda pelo celular.** Desligado por padrão, pareado por QR code, criptografado de ponta a
  ponta e revogável com um toque.
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

- **Histórico** das conversas anteriores deste projeto, inclusive as que começaram no terminal.
- **Uma fila** para as mensagens escritas enquanto um turno roda, reordenável arrastando.
- **Melhorar o prompt**: a estrelinha reescreve seu rascunho em uma execução separada, sem gastar
  o contexto da conversa, e um botão traz de volta as suas palavras.
- **Ditado por voz** com a sua própria chave da Deepgram: segure um atalho, mesmo a partir do
  editor.
- **Avisos sonoros** para os sete momentos que merecem um, e só quando você já não está olhando.
- **Estatísticas** de horas, hábitos e conquistas, que dá para compartilhar como imagem.
- **Nove idiomas**, seguindo a sua IDE por padrão.
- **Seus buffers não salvos** são gravados antes do turno, e os arquivos que o agente mudou são
  relidos pela IDE na hora.

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
