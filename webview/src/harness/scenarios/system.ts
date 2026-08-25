import { agent, apiRetry, bash, checkpoint, replayed, scenario, shell, SESSION, textReply, toolResult, toolUse, turnResult, user, wait } from '../events'
import type { Scenario } from '../types'

export const scenariosSystem: Scenario[] = [
  scenario('session-crash', 'A broken session', 'system', [
    checkpoint('The user asks to run the tests', [user('Run the full set of tests'), wait(500)]),
    checkpoint('Bash: pnpm test', [toolUse('Bash', { command: 'pnpm test' }, 's13-1'), wait(900)]),
    checkpoint('-> the result', [toolResult('s13-1', 'Starting the suite...'), wait(700)]),
    checkpoint('Bash: vitest --coverage - it hangs', [
      toolUse('Bash', { command: 'pnpm vitest run --coverage' }, 's13-2'),
      wait(1500),
    ]),
    checkpoint('The session breaks off', [shell({ type: 'processExited', sessionId: SESSION, exitCode: 1 })]),
  ]),

  scenario('context-compaction', 'Compacting the context', 'system', [
    checkpoint('The user carries on with the refactoring', [user('Let us carry on with the big refactoring'), wait(500)]),
    // A real CLI first sends a separate "compacting" status - long before the outcome with the numbers.
    // Without this step there is no trace in the feed of the compaction happening at all: the CONTEXT card
    // appears right here, in a pending state. The pause is long on purpose: a compaction in real life takes
    // tens of seconds, and the percentage on the card is counted off a stopwatch. Over a second and a half
    // it would not move at all, and there would be nothing to look at on this step.
    checkpoint('The context is being compacted', [
      agent({ type: 'system', subtype: 'status', status: 'compacting' }),
      wait(6000),
    ]),
    checkpoint('The context has been compacted', [
      agent({
        type: 'system',
        subtype: 'compact_boundary',
        compact_metadata: { trigger: 'automatic', pre_tokens: 168000, post_tokens: 41000, duration_ms: 3200 },
      }),
      agent({ type: 'system', subtype: 'status', compact_result: 'completed' }),
      wait(800),
    ]),
    checkpoint('The finished answer', [
      ...textReply('The context has been compacted, but I remember the gist of the refactoring - let us carry on.'),
      turnResult(2200),
    ]),
  ]),

  scenario('error-turn', 'An error in a turn', 'system', [
    checkpoint('The user asks to deploy production', [user('Deploy production'), wait(500)]),
    checkpoint('Bash: deploy:prod', [toolUse('Bash', { command: 'pnpm run deploy:prod' }, 's15-1'), wait(1200)]),
    checkpoint('-> a deploy error', [toolResult('s15-1', 'Error: DEPLOY_TOKEN is not set', true), wait(400)]),
    checkpoint('The turn ended in an error', [
      agent({
        type: 'result',
        subtype: 'error_during_execution',
        is_error: true,
        result: 'The deploy failed: DEPLOY_TOKEN is not set.',
        duration_ms: 2600,
      }),
    ]),
  ]),

  /**
   * A failed CLI request speaks twice: first as the agent's line in the stream, then as the same string in
   * its own stderr. The point of the scenario is the second checkpoint: one red card is left in the feed
   * instead of a pair of identical paragraphs in a row, and the address in it is live - that is what one
   * follows to see what is wrong with the outside service.
   */
  scenario('error-echo', 'An error arrives twice', 'system', [
    checkpoint('The agent answers with the error text', [
      ...textReply('API Error: 500 Internal server error. This is a server-side issue, usually temporary — try again in a moment. If it persists, check https://status.claude.com.'),
      wait(600),
    ]),
    checkpoint('The same string arrives from the process', [
      shell({
        type: 'error',
        sessionId: SESSION,
        message:
          'API Error: 500 Internal server error. This is a server-side issue, usually temporary — try again in a moment. If it persists, check https://status.claude.com.',
      }),
      turnResult(4300),
    ]),
  ]),

  /**
   * Anthropic's servers are overloaded and the CLI waits the refusal out in order to repeat the request. The
   * point of the scenario is the first two checkpoints: before them the panel stayed silent in such a place,
   * showing a "Claude is thinking" with a running counter although the request never reached the model at
   * all and the conversation simply stood still.
   *
   * The pauses are genuine: the attempts run with a growing wait, as in real life, and the countdown to the
   * next one is visible live.
   */
  scenario('api-retry', 'An overloaded API', 'system', [
    checkpoint('The user asks to commit', [user('Commit and push'), wait(600)]),
    checkpoint('The server is overloaded, the retries run', [
      apiRetry(1, 600),
      wait(600),
      apiRetry(2, 1200),
      wait(1200),
      apiRetry(3, 2500),
      wait(2500),
      apiRetry(4, 5000),
      wait(5000),
    ]),
    checkpoint('The request got through, the agent answers', [
      ...textReply('The server has let up - committing and pushing.'),
      toolUse('Bash', { command: 'git commit -am "fix: close out stalled turns" && git push' }, 's16-1'),
      wait(900),
      toolResult('s16-1', 'main -> main'),
      turnResult(11800),
    ]),
  ]),

  /**
   * The same refusal, but the attempts have run out. The CLI closes such a turn not with the model's answer
   * but with a stub of its own holding the error's text - by it the retry card understands that the affair
   * ended in a surrender rather than a success.
   */
  scenario('api-retry-exhausted', 'An overloaded API: the attempts ran out', 'system', [
    checkpoint('The user asks to work through the log', [user('Work out why the build is failing'), wait(500)]),
    checkpoint('The retries do not help', [
      apiRetry(1, 600),
      wait(600),
      apiRetry(2, 1500),
      wait(1500),
      apiRetry(3, 4000),
      wait(4000),
    ]),
    checkpoint('The CLI gives up', [
      agent({
        type: 'assistant',
        message: {
          model: '<synthetic>',
          content: [
            {
              type: 'text',
              text: 'API Error: 529 Overloaded. This is a server-side issue, usually temporary — try again in a moment.',
            },
          ],
        },
      }),
      agent({
        type: 'result',
        subtype: 'success',
        is_error: true,
        result: 'API Error: 529 Overloaded. This is a server-side issue, usually temporary — try again in a moment.',
        duration_ms: 9200,
      }),
    ]),
  ]),

  scenario('clear-conversation', '/clear wipes the conversation', 'system', [
    checkpoint('The user asks about the history', [user('Tell me what we have already discussed'), wait(500)]),
    checkpoint('The finished answer', [
      ...textReply('So far this is the first line in the conversation - there is not much to discuss.'),
      turnResult(1200),
      wait(600),
    ]),
    checkpoint('The user types /clear', [user('/clear'), wait(400)]),
    checkpoint('The conversation is wiped', [agent({ type: 'conversation_reset', new_conversation_id: 'demo-cleared' }), wait(300)]),
    // A /clear closes the turn the same way the real CLI does: without calling the model, with a
    // "(no content)" placeholder plus a result - otherwise the status and the Stop button hang forever, and
    // suppressNextMeta, which this scenario exists for, goes unchecked.
    checkpoint('The /clear turn ends', [
      agent({ type: 'assistant', message: { content: [{ type: 'text', text: '(no content)' }] } }),
      turnResult(300),
    ]),
  ]),

  scenario('bash-mode', 'A command through !', 'system', [
    checkpoint('Checking the status oneself, without the agent', [
      bash('git status -sb', '## main...origin/main\n M webview/src/App.tsx\n?? webview/src/feed/bash.ts'),
      wait(600),
    ]),
    checkpoint('The command failed', [
      bash('pnpm typecheck', 'src/App.tsx(42,7): error TS2322: Type "string" is not assignable to type "number".', {
        exitCode: 2,
        stderr: 'ELIFECYCLE  Command failed with exit code 2.',
      }),
      wait(600),
    ]),
    checkpoint('Asking the agent - the output travels with the question', [
      user('Fix this error'),
      wait(600),
    ]),
    checkpoint('The finished answer', [
      ...textReply('I see - in App.tsx a string landed where a number is expected. Fixing it.'),
      turnResult(1800),
    ]),
  ]),

  /**
   * A tab opened from the history: the panel replays the saved conversation and then declares the replay
   * finished. The point of the scenario is the second checkpoint: before it the background subagent looks
   * as though it were working (a chip in the header, a counter, a "Waiting for subagent" under the feed)
   * although there is nothing to work in this tab. Its outcome arrives through a system event while the
   * conversation holds only lines, so only the replay's end can close the card.
   */
  scenario('resumed-conversation', 'A conversation from the history', 'system', [
    checkpoint('The replay of a past conversation', [
      ...replayed([
        // The person's line arrives as a record from the conversation: there was nobody here to put it into
        // the feed on send, as in a live conversation.
        agent({
          type: 'user',
          message: { content: [{ type: 'text', text: 'Take a fresh look at the settings panel' }] },
          timestamp: '2026-08-17T09:41:07.000Z',
        }),
        wait(300),
        toolUse('Agent', { subagent_type: 'Explore', description: 'Review plan: UI consistency' }, 'r-1'),
        wait(300),
        toolResult('r-1', 'Async agent launched successfully. Agent ID: a90aa'),
        wait(300),
        ...textReply('Started the review in the background - I will come back with the findings.'),
        turnResult(4200),
      ]),
    ]),
    /**
     * The same past conversation further on: the agent asked the person with options, they answered, and the
     * answer lies in the conversation as an ordinary line. The question card must not appear over the input
     * field here at all - this question was answered somewhere in the past (see AskItem.historic).
     */
    checkpoint('The replay held a question with options - and an answer to it', [
      ...replayed([
        toolUse(
          'AskUserQuestion',
          {
            questions: [
              {
                question: 'Keep the previous order of the sections in the settings?',
                header: 'Order',
                multiSelect: false,
                options: [
                  { label: 'Keep it', description: 'Move nothing, only fix the look' },
                  { label: 'Rebuild it', description: 'Group them by meaning afresh' },
                ],
              },
            ],
          },
          'r-ask',
        ),
        wait(300),
        agent({
          type: 'user',
          message: {
            content: [
              {
                type: 'text',
                text: 'Keep the previous order of the sections in the settings?\nKeep it',
              },
            ],
          },
          timestamp: '2026-08-17T09:44:12.000Z',
        }),
        wait(300),
        ...textReply('All right, I am leaving the order alone - only fixing the look.'),
        turnResult(2600),
      ]),
    ]),
    checkpoint('The replay has finished', [shell({ type: 'replayFinished', sessionId: SESSION })]),
  ]),

  scenario('rich-markdown', 'An answer with markdown', 'system', [
    checkpoint('The user asks for a useDebounce hook example', [
      user('Show me an example of a useDebounce hook'),
      wait(600),
    ]),
    checkpoint('A finished answer with code and a list', [
      ...textReply(
        [
          'Here is a simple version:',
          '',
          '```ts',
          'function useDebounce<T>(value: T, delay: number): T {',
          '  const [debounced, setDebounced] = useState(value)',
          '',
          '  useEffect(() => {',
          '    const id = setTimeout(() => setDebounced(value), delay)',
          '    return () => clearTimeout(id)',
          '  }, [value, delay])',
          '',
          '  return debounced',
          '}',
          '```',
          '',
          'Briefly about what happens here:',
          '- on every change of `value` the timer starts afresh',
          '- the value updates only once the user has stopped typing',
          '- `delay` can be tuned for a particular field',
        ].join('\n'),
      ),
      turnResult(2400),
    ]),
  ]),

  /**
   * The CLI moves the conversation to another model by itself - the guard that fires when a model's
   * safeguards flag the message (a security audit reads as "cyber" to them). Recorded from a live run:
   * both models, the wording of the reason and the order of the events are the CLI's own.
   *
   * The point of the scenario is that the swap becomes visible. It used to be silent: the selector simply
   * started naming another model, and the agent - which does not see this event at all and knows only what
   * its system prompt tells it - went on insisting it was working as Fable. What is worth looking at is
   * the MODEL card in the feed and the MODEL button under the panel: the accent on it and its tooltip.
   */
  scenario('model-fallback', 'The CLI swaps the model itself', 'system', [
    checkpoint('The conversation runs on the chosen Fable', [
      shell({
        type: 'init',
        projectName: 'amazing-claude-code',
        workingDirectory: '/Users/max/Documents/Projects/amazing-claude-code',
        preferences: { model: 'fable', effort: 'xhigh', mode: 'bypassPermissions' },
      }),
      // Without the catalogue there is nothing to compare the choice against: "fable" alone does not say
      // which identifier it expands into, and the button has no right to call anything a swap (see
      // switchedModel in catalog.ts).
      shell({
        type: 'models',
        models: [
          { value: 'default', label: 'Default (recommended)', description: 'Use the model this session starts with.', resolved: 'claude-fable-5' },
          { value: 'fable', label: 'Fable', description: 'Fable 5 · Fast and capable', resolved: 'claude-fable-5' },
          { value: 'opus', label: 'Opus', description: 'Opus 5 · Best for everyday, complex tasks', resolved: 'claude-opus-5' },
        ],
      }),
      agent({ type: 'system', subtype: 'init', model: 'claude-fable-5' }),
      user('Audit the remote-access chain: the relay, the crypto, the mobile client'),
      wait(500),
    ]),
    checkpoint('Fable starts the work', [
      agent({
        type: 'assistant',
        message: {
          model: 'claude-fable-5',
          content: [{ type: 'text', text: 'Taking the whole chain: the session core, the relay and the crypto. Starting with the structure.' }],
        },
      }),
      wait(900),
    ]),
    checkpoint('The safeguards fire - the CLI swaps the model', [
      agent({
        type: 'system',
        subtype: 'model_refusal_fallback',
        originalModel: 'claude-fable-5',
        fallbackModel: 'claude-opus-4-8',
        content:
          "Fable 5's safeguards flagged this message. Our intentionally broad safeguards allow us to deliver more capabilities faster, but can sometimes flag legitimate coding, cybersecurity, and biology tasks. Switched to Opus 4.8. Send feedback with /feedback or learn more: https://support.claude.com/en/articles/15363606",
      }),
      wait(700),
    ]),
    checkpoint('The work carries on, on the other model', [
      agent({
        type: 'assistant',
        message: {
          model: 'claude-opus-4-8',
          content: [{ type: 'text', text: 'Found the whole chain. Reading the crypto core - it is the most critical part.' }],
        },
      }),
      turnResult(46800),
    ]),
  ]),

  /**
   * A 1M model chosen by hand, and the answers that come back signed without that mark - the CLI writes
   * the window into a choice ("opus[1m]") but not into the signature under an answer ("claude-opus-5").
   *
   * The point of the scenario is that nothing moves: the MODEL button says "Opus 5 1M" from the choice
   * onwards and stays that way when the answers start arriving. It used to drop to a bare "Opus" a few
   * seconds in - a model that stands in no menu at all - and that read as the panel resetting the choice
   * by itself.
   */
  scenario('model-1m-stays', 'A 1M choice stays put', 'system', [
    checkpoint('The 1M model is chosen', [
      shell({
        type: 'init',
        projectName: 'amazing-claude-code',
        workingDirectory: '/Users/max/Documents/Projects/amazing-claude-code',
        preferences: { model: 'opus[1m]', effort: 'high', mode: 'acceptEdits' },
      }),
      shell({
        type: 'models',
        models: [
          { value: 'default', label: 'Default (recommended)', description: 'Use the model this session starts with.', resolved: 'claude-opus-5' },
          { value: 'opus', label: 'Opus', description: 'Opus 5 · Best for everyday, complex tasks', resolved: 'claude-opus-5' },
          { value: 'opus[1m]', label: 'Opus (1M context)', description: 'Opus 5 with 1M context', resolved: 'claude-opus-5[1m]' },
          { value: 'fable', label: 'Fable', description: 'Fable 5 · Fast and capable', resolved: 'claude-fable-5' },
        ],
      }),
      agent({ type: 'system', subtype: 'init', model: 'claude-opus-5' }),
      user('Walk through the whole feed builder and tell me what is worth simplifying'),
      wait(600),
    ]),
    checkpoint('The answer arrives signed without the window mark', [
      agent({
        type: 'assistant',
        message: {
          model: 'claude-opus-5',
          content: [{ type: 'text', text: 'Read the builder whole. Three places are worth simplifying - starting with the first.' }],
        },
      }),
      turnResult(9400),
    ]),
  ]),
]
