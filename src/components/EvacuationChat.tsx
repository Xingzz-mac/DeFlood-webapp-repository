import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from 'react'
import type { CommunityData } from '../context/CommunityContext'
import {
  buildEvacuationChatPayload,
  buildEvacuationChatTrustedFacts,
  capConversationHistory,
  planningContextFingerprint,
  requestEvacuationChat,
  suggestedEvacuationChatQuestions,
  type EvacuationChatHistoryMessage,
  type EvacuationChatPayload,
  type EvacuationChatResult,
  type EvacuationChatTrustedFact,
} from '../services/evacuationChat'
import type { AllowedAction, EvacuationPlanResult } from '../services/evacuationTypes'
import type { RiskResult } from '../services/riskTypes'

type ChatRequester = (
  payload: EvacuationChatPayload,
  currentPlan: EvacuationPlanResult,
) => Promise<EvacuationChatResult>

interface EvacuationChatProps {
  risk: RiskResult
  community: CommunityData
  plan: EvacuationPlanResult
  requester?: ChatRequester
}

interface DisplayMessage {
  id: number
  role: 'user' | 'assistant' | 'context'
  content: string
  facts: EvacuationChatTrustedFact[]
  actions: AllowedAction[]
  missingInformation: string[]
  error: boolean
}

const UNAVAILABLE_MESSAGE = 'DeFlood AI is temporarily unavailable. The verified planning information above is still available.'
const NO_VERIFIED_ANSWER_MESSAGE = 'That information is not available in the current verified DeFlood data.'
const STALE_RESPONSE_MESSAGE = 'Planning data changed while DeFlood AI was responding. Please ask again using the latest data.'

function revalidateResult(
  result: EvacuationChatResult,
  currentPlan: EvacuationPlanResult,
  currentFacts: EvacuationChatTrustedFact[],
): EvacuationChatResult {
  const currentFactMap = new Map(currentFacts.map(fact => [fact.id, fact]))
  const seenFacts = new Set<string>()
  const facts = result.facts.flatMap(fact => {
    if (seenFacts.has(fact.id)) return []
    const trusted = currentFactMap.get(fact.id)
    if (!trusted) return []
    seenFacts.add(fact.id)
    return [trusted]
  })
  const currentActions = new Map(currentPlan.allowedActions.map(action => [action.id, action]))
  const seenActions = new Set<string>()
  const actions = result.actions.flatMap(action => {
    if (seenActions.has(action.id)) return []
    const trusted = currentActions.get(action.id)
    if (!trusted) return []
    seenActions.add(action.id)
    return [trusted]
  })
  const currentMissing = new Set(currentPlan.missingInformation)
  const missingInformation = [...new Set(result.missingInformation)]
    .filter(item => currentMissing.has(item))
  return { ...result, facts, actions, missingInformation }
}

export default function EvacuationChat({
  risk,
  community,
  plan,
  requester = requestEvacuationChat,
}: EvacuationChatProps) {
  const [messages, setMessages] = useState<DisplayMessage[]>([])
  const [draft, setDraft] = useState('')
  const [loading, setLoading] = useState(false)
  const loadingRef = useRef(false)
  const nextMessageId = useRef(1)
  const messageEndRef = useRef<HTMLDivElement | null>(null)
  const trustedFacts = buildEvacuationChatTrustedFacts(risk, community, plan)
  const contextFingerprint = planningContextFingerprint(risk, community, plan)
  const latestContextRef = useRef({ contextFingerprint, plan, trustedFacts })
  latestContextRef.current = { contextFingerprint, plan, trustedFacts }
  const previousContextFingerprint = useRef(contextFingerprint)
  const suggestions = useMemo(
    () => suggestedEvacuationChatQuestions(risk, plan),
    [plan, risk],
  )

  const addMessage = (
    role: DisplayMessage['role'],
    content: string,
    extras: Partial<Pick<DisplayMessage, 'facts' | 'actions' | 'missingInformation' | 'error'>> = {},
  ): DisplayMessage => ({
    id: nextMessageId.current++,
    role,
    content,
    facts: extras.facts ?? [],
    actions: extras.actions ?? [],
    missingInformation: extras.missingInformation ?? [],
    error: extras.error ?? false,
  })

  useEffect(() => {
    if (previousContextFingerprint.current === contextFingerprint) return
    previousContextFingerprint.current = contextFingerprint
    setMessages(current => current.length === 0
      ? current
      : [...current, addMessage(
          'context',
          'Planning data updated. New answers will use the latest community and risk information.',
        )])
  }, [contextFingerprint])

  useEffect(() => {
    messageEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [loading, messages])

  const historyForRequest = (): EvacuationChatHistoryMessage[] => capConversationHistory(
    messages.flatMap(message => (
      (message.role === 'user' || message.role === 'assistant') && !message.error
        ? [{
            role: message.role,
            content: [
              message.content,
              ...message.facts.map(fact => fact.text),
              ...message.actions.map(action => `Verified action: ${action.text}`),
              ...message.missingInformation.map(item => `Still unknown: ${item}`),
            ].join('\n'),
          }]
        : []
    )),
  )

  const sendQuestion = async (value: string) => {
    const question = value.trim()
    if (!question || loadingRef.current) return
    loadingRef.current = true
    const requestFingerprint = contextFingerprint
    const history = historyForRequest()
    const payload = buildEvacuationChatPayload(question, history, risk, community, plan)
    setMessages(current => [...current, addMessage('user', question)])
    setDraft('')
    setLoading(true)
    try {
      const response = await requester(payload, plan)
      if (requestFingerprint !== latestContextRef.current.contextFingerprint) {
        setMessages(current => [...current, addMessage('assistant', STALE_RESPONSE_MESSAGE, { error: true })])
        setDraft(question)
        return
      }
      const validated = revalidateResult(
        response,
        latestContextRef.current.plan,
        latestContextRef.current.trustedFacts,
      )
      const content = validated.facts.length > 0
        ? 'Here is the current verified DeFlood information.'
        : NO_VERIFIED_ANSWER_MESSAGE
      setMessages(current => [...current, addMessage('assistant', content, {
        facts: validated.facts,
        actions: validated.actions,
        missingInformation: validated.missingInformation,
      })])
    } catch {
      setMessages(current => [...current, addMessage('assistant', UNAVAILABLE_MESSAGE, { error: true })])
      setDraft(question)
    } finally {
      loadingRef.current = false
      setLoading(false)
    }
  }

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    void sendQuestion(draft)
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== 'Enter' || event.shiftKey) return
    event.preventDefault()
    void sendQuestion(draft)
  }

  const clearChat = () => {
    setMessages([])
    setDraft('')
  }

  const demoActive = risk.engineVersion.startsWith('deflood-dev-scenario')

  return (
    <section className="mt-5 rounded-2xl border border-indigo-200 bg-indigo-50/50 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold text-gray-900">Ask DeFlood AI</h2>
          <p className="mt-1 max-w-2xl text-sm text-gray-600">
            Ask questions about the current flood risk, community resources, missing information, or verified planning actions.
          </p>
        </div>
        {messages.length > 0 && (
          <button
            type="button"
            onClick={clearChat}
            disabled={loading}
            className="text-xs font-semibold text-indigo-700 hover:underline disabled:opacity-50"
          >
            Clear chat
          </button>
        )}
      </div>
      <p className="mt-3 text-xs text-gray-500">
        AI explains verified DeFlood data and actions. It cannot change risk calculations or issue evacuation orders.
      </p>
      {demoActive && (
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-900">
          DEMO SCENARIO — Chat answers use demo risk, not live flood data.
        </div>
      )}

      <div
        aria-live="polite"
        aria-label="DeFlood AI conversation"
        className="mt-4 max-h-80 min-h-48 space-y-3 overflow-y-auto rounded-xl border border-indigo-100 bg-white p-4"
      >
        {messages.length === 0 && (
          <div>
            <p className="text-sm font-medium text-gray-700">Suggested questions</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {suggestions.map(suggestion => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => { void sendQuestion(suggestion) }}
                  disabled={loading}
                  className="rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-left text-xs font-medium text-indigo-800 hover:bg-indigo-100 disabled:opacity-50"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map(message => {
          if (message.role === 'context') {
            return (
              <div key={message.id} className="flex items-center gap-2 py-1 text-xs text-gray-500">
                <span className="h-px flex-1 bg-gray-200" />
                <span className="text-center">{message.content}</span>
                <span className="h-px flex-1 bg-gray-200" />
              </div>
            )
          }
          const user = message.role === 'user'
          return (
            <div key={message.id} className={`flex ${user ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[88%] rounded-2xl px-4 py-3 text-sm ${
                user
                  ? 'bg-[#1e3a5f] text-white'
                  : message.error
                    ? 'border border-amber-200 bg-amber-50 text-amber-950'
                    : 'bg-gray-100 text-gray-800'
              }`}>
                <div className="mb-1 text-[11px] font-bold uppercase tracking-wide opacity-70">
                  {user ? 'You' : 'DeFlood AI'}
                </div>
                <p className="whitespace-pre-wrap leading-relaxed">{message.content}</p>
                {message.facts.length > 0 && (
                  <div className="mt-3 border-t border-gray-300/60 pt-3">
                    <div className="text-xs font-bold text-gray-700">Verified information</div>
                    <ul className="mt-2 space-y-1.5 text-xs">
                      {message.facts.map(fact => <li key={fact.id}>• {fact.text}</li>)}
                    </ul>
                  </div>
                )}
                {message.actions.length > 0 && (
                  <div className="mt-3 border-t border-gray-300/60 pt-3">
                    <div className="text-xs font-bold text-gray-700">Verified actions</div>
                    <ul className="mt-2 space-y-1.5 text-xs">
                      {message.actions.map(action => <li key={action.id}>• {action.text}</li>)}
                    </ul>
                  </div>
                )}
                {message.missingInformation.length > 0 && (
                  <div className="mt-3 border-t border-gray-300/60 pt-3 text-xs text-gray-600">
                    <div className="font-bold">Still unknown</div>
                    <div className="mt-1">{message.missingInformation.join(' · ')}</div>
                  </div>
                )}
              </div>
            </div>
          )
        })}

        {loading && (
          <div className="text-sm text-indigo-700">DeFlood AI is thinking…</div>
        )}
        <div ref={messageEndRef} />
      </div>

      <form onSubmit={handleSubmit} className="mt-3 flex items-end gap-2">
        <div className="flex-1">
          <label htmlFor="deflood-chat-message" className="sr-only">Message DeFlood AI</label>
          <textarea
            id="deflood-chat-message"
            value={draft}
            onChange={event => setDraft(event.target.value)}
            onKeyDown={handleKeyDown}
            rows={2}
            placeholder="Ask about current risk or planning information…"
            className="w-full resize-none rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <p className="mt-1 text-[11px] text-gray-400">Enter to send · Shift+Enter for a new line</p>
        </div>
        <button
          type="submit"
          disabled={loading || draft.trim() === ''}
          className="mb-5 rounded-xl bg-[#1e3a5f] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#2d5282] disabled:cursor-not-allowed disabled:opacity-50"
        >
          Send
        </button>
      </form>
    </section>
  )
}
