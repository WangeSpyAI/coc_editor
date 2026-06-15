import { useCallback, useEffect, useMemo, useState } from 'react'
import './styles.css'
import type {
  EntityId,
  EventId,
  Fact,
  FactId,
  FireableEvent,
  LinkedRef,
  LogEntry,
  NearlyFireableEvent,
  ReadonlyScenarioSession,
  RevelationId,
  SceneId,
} from '../core/v6/types'
import {
  findCurrentLocation,
  projectRevelation,
  projectScene,
  searchScenario,
  type ItemProjection,
  type NpcProjection,
  type RevelationProjectionView,
  type SceneEventProjection,
  type SceneExitProjection,
  type SearchResult,
} from '../core/v6/queries'
import { listFireableEvents, listNearlyFireableEvents } from '../core/v6/engine'
import { disclosureLabel } from '../core/v6/labels'
import { useV6Session, type V6SessionController } from './useV6Session'

type ActiveView = 'scene' | 'facts' | 'revelations' | 'events' | 'log' | 'search'

const ONBOARDING_STORAGE_KEY = 'v6_onboarded'

const VIEW_LABELS: Record<ActiveView, string> = {
  scene: 'Scene投影',
  facts: '事実台帳',
  revelations: '真相一覧',
  events: 'イベント通知',
  log: 'セッションログ',
  search: '検索',
}

const VIEW_CAPTIONS: Record<ActiveView, string> = {
  scene: '今プレイヤーがいる場面。読み上げ文・登場NPC・手がかり・出口がここに集まります。',
  facts: 'この卓で今「成立している事実」の一覧。クリックで成立／未成立を切り替えます。',
  revelations: 'プレイヤーに気づかせたい真相と、それを渡す手がかり。話が収束しているか、次に何が足りないかが分かります。',
  events: '今の状況で起こせるイベントと、あと一歩で起こせるイベント。',
  log: '読み上げや事実の変化の記録。卓の進行ログです。',
  search: '「鍵はどこ？」のように、今の事実をすぐ引けます。',
}

function hasCompletedOnboarding(): boolean {
  try {
    return localStorage.getItem(ONBOARDING_STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

function persistOnboardingDismissal(): void {
  try {
    localStorage.setItem(ONBOARDING_STORAGE_KEY, '1')
  } catch {
    // The overlay can still close if localStorage is unavailable.
  }
}

function factIsTrue(session: ReadonlyScenarioSession, factId: FactId): boolean {
  return session.state.factStates[factId]?.isTrue ?? session.scenario.facts[factId]?.initial ?? false
}

function factStatement(session: ReadonlyScenarioSession, factId: FactId): string {
  return session.scenario.facts[factId]?.statement ?? factId
}

function refTitle(session: ReadonlyScenarioSession, ref: LinkedRef): string {
  switch (ref.type) {
    case 'scene':
      return session.scenario.scenes[ref.id as SceneId]?.name ?? ref.id
    case 'npc':
      return session.scenario.npcs[ref.id as keyof typeof session.scenario.npcs]?.name ?? ref.id
    case 'item':
      return session.scenario.items[ref.id as keyof typeof session.scenario.items]?.name ?? ref.id
    case 'clue':
      return session.scenario.clues[ref.id as keyof typeof session.scenario.clues]?.name ?? ref.id
    case 'fact':
      return factStatement(session, ref.id as FactId)
    case 'revelation':
      return session.scenario.revelations[ref.id as RevelationId]?.title ?? ref.id
    case 'event':
      return session.scenario.events[ref.id as EventId]?.name ?? ref.id
    case 'pc':
      return session.scenario.pcs[ref.id as keyof typeof session.scenario.pcs]?.name ?? ref.id
    case 'party':
      return session.scenario.parties[ref.id as keyof typeof session.scenario.parties]?.name ?? ref.id
    default: {
      const exhaustive: never = ref.type
      return exhaustive
    }
  }
}

function conditionText(session: ReadonlyScenarioSession, event: FireableEvent | NearlyFireableEvent): string {
  return event.reason.map((link) => (
    `${link.negate ? 'NOT ' : ''}${factStatement(session, link.factId)}`
  )).join(' / ')
}

function eventSceneNames(session: ReadonlyScenarioSession, sceneIds: readonly SceneId[]): string {
  return sceneIds.map((id) => session.scenario.scenes[id]?.name ?? id).join(' / ') || '全体'
}

function factSourceLabel(fact: Pick<Fact, 'historyPolicy' | 'source'>): string {
  if (fact.historyPolicy === 'generated') {
    return 'generated'
  }
  if (fact.source?.type === 'session-log') {
    return 'log'
  }
  return 'hand-written'
}

function matchKindLabel(kind: SearchResult['matchKind']): string {
  switch (kind) {
    case 'current-value':
      return '現在値'
    case 'name':
      return '名前'
    case 'fact':
      return '事実'
    case 'public-text':
      return 'PL文'
    case 'keeper-text':
      return 'KP文'
    default: {
      const exhaustive: never = kind
      return exhaustive
    }
  }
}

function formatLogTime(at: number): string {
  if (!Number.isFinite(at) || at <= 0) {
    return '-'
  }
  return new Date(at).toLocaleTimeString('ja-JP', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

function OrientationOverlay(props: { onClose(): void }) {
  const { onClose } = props

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  return (
    <div
      className="v6-onboarding-backdrop"
      data-testid="v6-onboarding-backdrop"
      onClick={onClose}
    >
      <section
        className="v6-onboarding-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="v6-onboarding-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="v6-onboarding-title">このツールは？</h2>
        <p>
          CoC のキーパー(KP)が、セッション中に必要な情報を手元に出しておくための道具です。多すぎて頭に入りきらない「今の場面・登場NPC・手がかり・分岐」を、あなたの代わりに覚えておく“外部脳”です。
        </p>
        <h3>使い方（3ステップ）</h3>
        <ol>
          <li>今いる場面を開き、青い「PL描写」をプレイヤーに読み上げる。</li>
          <li>登場NPCのカードを見て演じる。「KP秘密」はあなただけが見る欄です。</li>
          <li>プレイヤーが動いたら事実を更新。詰まったら「真相一覧」で“次に渡す手がかり”を確認する。</li>
        </ol>
        <p className="v6-onboarding-note">
          いま開いているのはサンプル「霧鐘荘の消えた鍵」です。自由に触って試してください。
        </p>
        <button type="button" className="v6-onboarding-primary" autoFocus onClick={onClose}>
          サンプルで試す
        </button>
      </section>
    </div>
  )
}

function currentSceneForEntity(
  session: ReadonlyScenarioSession,
  id: EntityId,
  depth = 0,
): SceneId | null {
  if (depth > 2) {
    return null
  }
  const location = findCurrentLocation(session, id)
  if (location?.type === 'scene') {
    return location.id
  }
  if (location?.type === 'npc') {
    return currentSceneForEntity(session, location.id, depth + 1)
  }
  return null
}

function sceneForRef(session: ReadonlyScenarioSession, ref: LinkedRef): SceneId | null {
  switch (ref.type) {
    case 'scene':
      return ref.id as SceneId
    case 'npc':
    case 'item':
    case 'clue':
      return currentSceneForEntity(session, ref.id)
    case 'event':
      return session.scenario.events[ref.id as EventId]?.sceneIds[0] ?? null
    case 'revelation': {
      const revelation = session.scenario.revelations[ref.id as RevelationId]
      for (const clueId of revelation?.clueIds ?? []) {
        const sceneId = currentSceneForEntity(session, clueId)
        if (sceneId) {
          return sceneId
        }
      }
      return null
    }
    case 'fact': {
      const fact = session.scenario.facts[ref.id as FactId]
      for (const link of fact?.links ?? []) {
        const sceneId = sceneForRef(session, link)
        if (sceneId) {
          return sceneId
        }
      }
      return null
    }
    case 'pc':
    case 'party':
      return null
    default: {
      const exhaustive: never = ref.type
      return exhaustive
    }
  }
}

function TextEditor(props: {
  label: string
  value: string
  minRows?: number
  onSave(value: string): void
}) {
  const [draft, setDraft] = useState(props.value)
  const dirty = draft !== props.value

  useEffect(() => {
    setDraft(props.value)
  }, [props.value])

  return (
    <div className="v6-editor">
      <label>
        <span>{props.label}</span>
        <textarea
          value={draft}
          rows={props.minRows ?? 4}
          onChange={(event) => setDraft(event.currentTarget.value)}
        />
      </label>
      <button type="button" disabled={!dirty} onClick={() => props.onSave(draft)}>
        保存
      </button>
    </div>
  )
}

function NpcCard(props: { card: NpcProjection }) {
  const { card } = props
  return (
    <article className="v6-card">
      <header className="v6-card-header">
        <h4>{card.npc.name}</h4>
        <span>{card.location?.label ?? '所在不明'}</span>
      </header>
      <div className="v6-public-copy">{card.npc.publicProfile.text}</div>
      {card.npc.keeperSecret && (
        <div className="v6-keeper-copy">
          <strong>KP秘密</strong>
          <p>{card.npc.keeperSecret.text}</p>
        </div>
      )}
      <dl className="v6-kv">
        <dt>意図</dt>
        <dd>{card.intent?.label ?? '未設定'}</dd>
        <dt>恐れ</dt>
        <dd>{card.fear?.label ?? '未設定'}</dd>
        <dt>感情</dt>
        <dd>{card.emotion?.label ?? '未設定'}</dd>
        <dt>性格</dt>
        <dd>{card.npc.staticProfile.personality ?? '未設定'}</dd>
        <dt>動機</dt>
        <dd>{card.npc.staticProfile.motivation ?? '未設定'}</dd>
        <dt>口調</dt>
        <dd>{card.npc.staticProfile.voice ?? '未設定'}</dd>
      </dl>
      <div className="v6-fact-list">
        <strong>知識</strong>
        {card.knowledgeFacts.length === 0 ? (
          <span className="v6-muted">なし</span>
        ) : card.knowledgeFacts.map((fact) => (
          <span key={fact.id} className="v6-pill">{fact.statement}</span>
        ))}
      </div>
    </article>
  )
}

function ItemRow(props: {
  row: ItemProjection
  session: ReadonlyScenarioSession
}) {
  const { row, session } = props
  return (
    <article className="v6-row-card">
      <div>
        <h4>{row.entity.name}</h4>
        <p className="v6-muted">{row.kind === 'clue' ? 'Clue' : 'Item'}</p>
        {row.entity.publicDescription && (
          <p className="v6-public-copy">{row.entity.publicDescription.text}</p>
        )}
        {(row.entity.keeperNotes ?? []).map((note, index) => (
          <p key={index} className="v6-keeper-copy">{note.text}</p>
        ))}
        {row.kind === 'clue' && row.clueFact && (
          <p className="v6-muted">手がかりFact: {row.clueFact.statement}</p>
        )}
        {row.route && (
          <p className="v6-keeper-copy">入手経路: {row.route.how.text}</p>
        )}
      </div>
      <dl className="v6-kv v6-row-meta">
        <dt>所在</dt>
        <dd>{row.location?.label ?? '不明'}</dd>
        <dt>開示</dt>
        <dd>{disclosureLabel(row.disclosure) ?? '不明'}</dd>
        <dt>関連真相</dt>
        <dd>
          {row.truthLinks.map((id) => session.scenario.revelations[id]?.title ?? id).join(' / ') || 'なし'}
        </dd>
      </dl>
    </article>
  )
}

function FireableSceneEvent(props: {
  sceneEvent: SceneEventProjection
  onApply(eventId: EventId): void
}) {
  const { sceneEvent, onApply } = props
  return (
    <article className="v6-row-card v6-event-ready">
      <div>
        <h4>{sceneEvent.event.name}</h4>
        {sceneEvent.event.publicDescription && (
          <p className="v6-public-copy">{sceneEvent.event.publicDescription.text}</p>
        )}
        {(sceneEvent.event.keeperNotes ?? []).map((note, index) => (
          <p key={index} className="v6-keeper-copy">{note.text}</p>
        ))}
      </div>
      <button type="button" onClick={() => onApply(sceneEvent.event.id)}>
        apply
      </button>
    </article>
  )
}

function SceneExitButton(props: {
  exit: SceneExitProjection
  onNavigate(sceneId: SceneId): void
}) {
  const { exit, onNavigate } = props
  return (
    <button
      type="button"
      className="v6-exit"
      disabled={!exit.available || !exit.toScene}
      onClick={() => exit.toScene && onNavigate(exit.toScene.id)}
    >
      {exit.exit.label ?? exit.toScene?.name ?? exit.exit.toSceneId}
      {!exit.available && <span> 条件未達</span>}
    </button>
  )
}

function SceneProjectionPage(props: {
  v6: V6SessionController
  nearlyFireable: NearlyFireableEvent[]
}) {
  const { v6 } = props
  const projection = useMemo(
    () => projectScene(v6.session, v6.selectedSceneId),
    [v6.session, v6.selectedSceneId],
  )
  const sceneNearly = props.nearlyFireable.filter((event) => (
    event.sceneIds.includes(v6.selectedSceneId)
  ))
  const keeperDraft = projection.keeperNotes.map((note) => note.text).join('\n\n')

  return (
    <section className="v6-screen">
      <div className="v6-screen-title">
        <div>
          <p className="v6-eyebrow">Scene投影ページ</p>
          <h2 data-testid="active-scene-name">{projection.scene.name}</h2>
          <p className="v6-screen-caption">{VIEW_CAPTIONS.scene}</p>
        </div>
        <span className="v6-muted">{projection.scene.kind}</span>
      </div>

      <section className="v6-panel v6-public-panel" data-testid="scene-public">
        <h3>PL描写</h3>
        {projection.description.map((block, index) => (
          <p key={index}>{block.text}</p>
        ))}
        <TextEditor
          label="PL描写を編集"
          value={projection.scene.publicDescription.text}
          onSave={(value) => v6.updateSceneText(projection.scene.id, { publicDescription: value })}
        />
      </section>

      <section className="v6-panel v6-keeper-panel" data-testid="scene-keeper">
        <h3>KPメモ</h3>
        {projection.keeperNotes.length === 0 ? (
          <p className="v6-muted">なし</p>
        ) : projection.keeperNotes.map((note, index) => (
          <p key={index}>{note.text}</p>
        ))}
        <TextEditor
          label="KPメモを編集"
          value={keeperDraft}
          onSave={(value) => v6.updateSceneText(projection.scene.id, {
            keeperNotes: value
              .split(/\n{2,}/)
              .map((note) => note.trim())
              .filter(Boolean),
          })}
        />
      </section>

      <section className="v6-panel">
        <h3>今ここにいるNPC</h3>
        {projection.npcs.length === 0 ? (
          <p className="v6-muted">なし</p>
        ) : (
          <div className="v6-grid">
            {projection.npcs.map((card) => <NpcCard key={card.npc.id} card={card} />)}
          </div>
        )}
      </section>

      <section className="v6-panel">
        <h3>今ここにあるItem / Clue</h3>
        {projection.items.length + projection.clues.length === 0 ? (
          <p className="v6-muted">なし</p>
        ) : (
          <div className="v6-stack">
            {[...projection.items, ...projection.clues].map((row) => (
              <ItemRow key={row.entity.id} row={row} session={v6.session} />
            ))}
          </div>
        )}
      </section>

      <section className="v6-panel">
        <h3>発生可能イベント</h3>
        {projection.fireableEvents.length === 0 ? (
          <p className="v6-muted">なし</p>
        ) : (
          <div className="v6-stack">
            {projection.fireableEvents.map((sceneEvent) => (
              <FireableSceneEvent
                key={sceneEvent.event.id}
                sceneEvent={sceneEvent}
                onApply={v6.applyEvent}
              />
            ))}
          </div>
        )}
        {sceneNearly.length > 0 && (
          <div className="v6-hint-list">
            <strong>あと1条件</strong>
            {sceneNearly.map((event) => (
              <p key={event.eventId}>
                {v6.session.scenario.events[event.eventId]?.name ?? event.eventId}: {factStatement(v6.session, event.unmetLink.factId)}
              </p>
            ))}
          </div>
        )}
      </section>

      <section className="v6-panel">
        <h3>出口</h3>
        <div className="v6-exits">
          {projection.exits.map((exit) => (
            <SceneExitButton key={exit.exit.toSceneId} exit={exit} onNavigate={v6.setSelectedSceneId} />
          ))}
        </div>
      </section>

      <section className="v6-panel">
        <h3>関連真相</h3>
        {projection.revelations.length === 0 ? (
          <p className="v6-muted">なし</p>
        ) : projection.revelations.map((revelation) => (
          <article key={revelation.id} className="v6-inline-card">
            <strong>{revelation.title}</strong>
            <p>{revelation.summary.text}</p>
          </article>
        ))}
      </section>
    </section>
  )
}

function FactLedger(props: { v6: V6SessionController }) {
  const [statement, setStatement] = useState('')
  const [initial, setInitial] = useState(true)
  const facts = Object.values(props.v6.session.scenario.facts)

  return (
    <section className="v6-screen">
      <div className="v6-screen-title">
        <div>
          <p className="v6-eyebrow">Fact</p>
          <h2>事実台帳</h2>
          <p className="v6-screen-caption">{VIEW_CAPTIONS.facts}</p>
        </div>
      </div>
      <form
        className="v6-form"
        onSubmit={(event) => {
          event.preventDefault()
          const trimmed = statement.trim()
          if (!trimmed) {
            return
          }
          props.v6.addFact(trimmed, initial, [{ type: 'scene', id: props.v6.selectedSceneId }])
          setStatement('')
          setInitial(true)
        }}
      >
        <input
          value={statement}
          placeholder="新しい事実"
          onChange={(event) => setStatement(event.currentTarget.value)}
        />
        <label className="v6-check">
          <input
            type="checkbox"
            checked={initial}
            onChange={(event) => setInitial(event.currentTarget.checked)}
          />
          trueで作成
        </label>
        <button type="submit" disabled={!statement.trim()}>追加</button>
      </form>
      <div className="v6-stack">
        {facts.map((fact) => {
          const generatedSlotFact = fact.historyPolicy === 'generated' || Boolean(fact.slot)
          return (
            <article key={fact.id} className="v6-row-card">
              <label className="v6-fact-toggle">
                <input
                  type="checkbox"
                  checked={factIsTrue(props.v6.session, fact.id)}
                  disabled={generatedSlotFact}
                  onChange={(event) => props.v6.setFactValue(fact.id, event.currentTarget.checked)}
                />
                <span>{fact.statement}</span>
              </label>
              <div className="v6-fact-meta">
                <span className={`v6-source v6-source-${factSourceLabel(fact)}`}>{factSourceLabel(fact)}</span>
                <span>{fact.id}</span>
                {generatedSlotFact && <span>Slot由来はassignSlotで更新</span>}
              </div>
            </article>
          )
        })}
      </div>
    </section>
  )
}

function RevelationCard(props: {
  projection: RevelationProjectionView
  session: ReadonlyScenarioSession
  onToggle(revelationId: RevelationId, understood: boolean): void
}) {
  const { projection, session } = props
  return (
    <article className="v6-card">
      <header className="v6-card-header">
        <h3>{projection.revelation.title}</h3>
        <label className="v6-check">
          <input
            type="checkbox"
            checked={projection.understood}
            onChange={(event) => props.onToggle(projection.revelation.id, event.currentTarget.checked)}
          />
          理解済み
        </label>
      </header>
      <p className="v6-keeper-copy">{projection.revelation.summary.text}</p>
      {projection.revelation.understandingGuide && (
        <p className="v6-keeper-copy">{projection.revelation.understandingGuide.text}</p>
      )}
      <dl className="v6-kv">
        <dt>発見済み</dt>
        <dd>{projection.discoveredClues.map((id) => session.scenario.clues[id]?.name ?? id).join(' / ') || 'なし'}</dd>
        <dt>未発見</dt>
        <dd>{projection.undiscoveredClues.map((id) => session.scenario.clues[id]?.name ?? id).join(' / ') || 'なし'}</dd>
        <dt>不足Fact</dt>
        <dd>{projection.missingFacts.map((id) => factStatement(session, id)).join(' / ') || 'なし'}</dd>
      </dl>
      <div className="v6-hint-list">
        <strong>利用可能ルート</strong>
        {projection.availableRoutes.length === 0 ? (
          <p>なし</p>
        ) : projection.availableRoutes.map((route, index) => (
          <p key={index}>{route.how.text}{route.fallback ? ` / fallback: ${route.fallback.text}` : ''}</p>
        ))}
      </div>
    </article>
  )
}

function RevelationList(props: { v6: V6SessionController }) {
  const projections = Object.keys(props.v6.session.scenario.revelations)
    .map((id) => projectRevelation(props.v6.session, id as RevelationId))

  return (
    <section className="v6-screen">
      <div className="v6-screen-title">
        <div>
          <p className="v6-eyebrow">Revelation</p>
          <h2>真相一覧</h2>
          <p className="v6-screen-caption">{VIEW_CAPTIONS.revelations}</p>
        </div>
      </div>
      <div className="v6-grid">
        {projections.map((projection) => (
          <RevelationCard
            key={projection.revelation.id}
            projection={projection}
            session={props.v6.session}
            onToggle={props.v6.setRevelationUnderstood}
          />
        ))}
      </div>
    </section>
  )
}

function EventNotice(props: {
  event: FireableEvent
  session: ReadonlyScenarioSession
  onApply(eventId: EventId): void
}) {
  const eventDef = props.session.scenario.events[props.event.eventId]
  return (
    <article className="v6-row-card v6-event-ready">
      <div>
        <h3>{eventDef?.name ?? props.event.eventId}</h3>
        <p className="v6-muted">{eventSceneNames(props.session, props.event.sceneIds)}</p>
        <p>{conditionText(props.session, props.event)}</p>
      </div>
      <button type="button" onClick={() => props.onApply(props.event.eventId)}>apply</button>
    </article>
  )
}

function EventNotifications(props: {
  v6: V6SessionController
  fireable: FireableEvent[]
  nearlyFireable: NearlyFireableEvent[]
}) {
  return (
    <section className="v6-screen">
      <div className="v6-screen-title">
        <div>
          <p className="v6-eyebrow">ConditionalEvent</p>
          <h2>イベント通知</h2>
          <p className="v6-screen-caption">{VIEW_CAPTIONS.events}</p>
        </div>
      </div>
      <section className="v6-panel">
        <h3>発生可能</h3>
        {props.fireable.length === 0 ? (
          <p className="v6-muted">なし</p>
        ) : props.fireable.map((event) => (
          <EventNotice
            key={event.eventId}
            event={event}
            session={props.v6.session}
            onApply={props.v6.applyEvent}
          />
        ))}
      </section>
      <section className="v6-panel">
        <h3>あと1条件</h3>
        {props.nearlyFireable.length === 0 ? (
          <p className="v6-muted">なし</p>
        ) : props.nearlyFireable.map((event) => (
          <article key={event.eventId} className="v6-inline-card">
            <strong>{props.v6.session.scenario.events[event.eventId]?.name ?? event.eventId}</strong>
            <p>{eventSceneNames(props.v6.session, event.sceneIds)}</p>
            <p>不足: {event.unmetLink.negate ? 'NOT ' : ''}{factStatement(props.v6.session, event.unmetLink.factId)}</p>
          </article>
        ))}
      </section>
    </section>
  )
}

function logDescription(session: ReadonlyScenarioSession, log: LogEntry): string {
  switch (log.type) {
    case 'description':
      return log.text.text
    case 'fact-change':
      return `${factStatement(session, log.factId)}: ${String(log.from)} -> ${String(log.to)}`
    case 'slot-change':
      return `${session.scenario.slots[log.slotId]?.kind ?? log.slotId}: ${log.fromFactId ? factStatement(session, log.fromFactId) : 'なし'} -> ${factStatement(session, log.toFactId)}`
    case 'event':
      return session.scenario.events[log.eventId]?.name ?? log.eventId
    case 'note':
      return log.text.text
    default: {
      const exhaustive: never = log
      return JSON.stringify(exhaustive)
    }
  }
}

function SessionLog(props: { v6: V6SessionController }) {
  const [note, setNote] = useState('')
  const logs = [...props.v6.session.state.log].reverse()
  return (
    <section className="v6-screen">
      <div className="v6-screen-title">
        <div>
          <p className="v6-eyebrow">Timeline</p>
          <h2>セッションログ</h2>
          <p className="v6-screen-caption">{VIEW_CAPTIONS.log}</p>
        </div>
      </div>
      <form
        className="v6-form"
        onSubmit={(event) => {
          event.preventDefault()
          const trimmed = note.trim()
          if (!trimmed) {
            return
          }
          props.v6.addSessionNote(trimmed, props.v6.selectedSceneId)
          setNote('')
        }}
      >
        <input
          value={note}
          placeholder="KPメモをログに追加"
          onChange={(event) => setNote(event.currentTarget.value)}
        />
        <button type="submit" disabled={!note.trim()}>追加</button>
      </form>
      <div className="v6-stack">
        {logs.length === 0 ? (
          <p className="v6-muted">ログなし</p>
        ) : logs.map((log) => (
          <article key={log.id} className="v6-log-entry">
            <span>{formatLogTime(log.at)}</span>
            <strong>{log.type}</strong>
            <p>{logDescription(props.v6.session, log)}</p>
            {log.type === 'event' && log.publicText && <p className="v6-public-copy">{log.publicText.text}</p>}
            {log.type === 'event' && log.keeperText && <p className="v6-keeper-copy">{log.keeperText.text}</p>}
          </article>
        ))}
      </div>
    </section>
  )
}

function SearchPanel(props: {
  v6: V6SessionController
  onOpenRef(ref: LinkedRef): void
}) {
  const [query, setQuery] = useState('')
  const results = query.trim() ? searchScenario(props.v6.session, query) : []

  return (
    <section className="v6-screen">
      <div className="v6-screen-title">
        <div>
          <p className="v6-eyebrow">Search</p>
          <h2>検索</h2>
          <p className="v6-screen-caption">{VIEW_CAPTIONS.search}</p>
        </div>
      </div>
      <input
        className="v6-search"
        aria-label="検索語"
        value={query}
        placeholder="日記はどこ / 鈴木は何を知っている"
        onChange={(event) => setQuery(event.currentTarget.value)}
      />
      <div className="v6-stack">
        {results.map((result) => (
          <button
            key={`${result.ref.type}:${result.ref.id}:${result.matchKind}:${result.snippet}`}
            type="button"
            className="v6-search-result"
            onClick={() => props.onOpenRef(result.ref)}
          >
            <span className="v6-source">{matchKindLabel(result.matchKind)}</span>
            <strong>{result.title}</strong>
            <span>{result.snippet}</span>
          </button>
        ))}
      </div>
    </section>
  )
}

function SceneSidebar(props: { v6: V6SessionController }) {
  const scenes = Object.values(props.v6.session.scenario.scenes)
  return (
    <aside className="v6-sidebar">
      <div className="v6-sidebar-title">
        <strong>Scenes</strong>
        <button type="button" onClick={props.v6.loadDemo}>demo</button>
      </div>
      {scenes.map((scene) => (
        <button
          key={scene.id}
          type="button"
          className={scene.id === props.v6.selectedSceneId ? 'active' : ''}
          onClick={() => props.v6.setSelectedSceneId(scene.id)}
        >
          {scene.name}
        </button>
      ))}
    </aside>
  )
}

export function AppV6() {
  const v6 = useV6Session()
  const [activeView, setActiveView] = useState<ActiveView>('scene')
  const [showOnboarding, setShowOnboarding] = useState(() => !hasCompletedOnboarding())
  const fireable = useMemo(() => listFireableEvents(v6.session), [v6.session])
  const nearlyFireable = useMemo(() => listNearlyFireableEvents(v6.session), [v6.session])

  const closeOnboarding = useCallback(() => {
    persistOnboardingDismissal()
    setShowOnboarding(false)
  }, [])

  const openRef = (ref: LinkedRef) => {
    const sceneId = sceneForRef(v6.session, ref)
    if (sceneId) {
      v6.setSelectedSceneId(sceneId)
      setActiveView('scene')
      return
    }
    if (ref.type === 'revelation') {
      setActiveView('revelations')
      return
    }
    if (ref.type === 'event') {
      setActiveView('events')
      return
    }
    if (ref.type === 'fact') {
      setActiveView('facts')
    }
  }

  return (
    <div className="v6-app">
      <header className="v6-header">
        <div>
          <p className="v6-eyebrow">TRPG Scenario Editor</p>
          <div className="v6-title-row">
            <h1>{v6.session.scenario.title}</h1>
            <span className="v6-sample-badge">サンプル</span>
          </div>
        </div>
        <nav className="v6-tabs">
          {(Object.keys(VIEW_LABELS) as ActiveView[]).map((view) => (
            <button
              key={view}
              type="button"
              className={activeView === view ? 'active' : ''}
              onClick={() => setActiveView(view)}
            >
              {VIEW_LABELS[view]}
              {view === 'events' && fireable.length > 0 && <span>{fireable.length}</span>}
            </button>
          ))}
        </nav>
        <div className="v6-history">
          <button type="button" aria-label="使い方を開く" onClick={() => setShowOnboarding(true)}>
            ？使い方
          </button>
          <button type="button" onClick={v6.undo} disabled={!v6.canUndo}>Undo</button>
          <button type="button" onClick={v6.redo} disabled={!v6.canRedo}>Redo</button>
        </div>
      </header>

      <SceneSidebar v6={v6} />

      <main className="v6-main">
        {activeView === 'scene' && <SceneProjectionPage v6={v6} nearlyFireable={nearlyFireable} />}
        {activeView === 'facts' && <FactLedger v6={v6} />}
        {activeView === 'revelations' && <RevelationList v6={v6} />}
        {activeView === 'events' && (
          <EventNotifications v6={v6} fireable={fireable} nearlyFireable={nearlyFireable} />
        )}
        {activeView === 'log' && <SessionLog v6={v6} />}
        {activeView === 'search' && <SearchPanel v6={v6} onOpenRef={openRef} />}
      </main>

      <footer className="v6-footer">
        <span>{Object.keys(v6.session.scenario.facts).length} facts</span>
        <span>{fireable.length} fireable</span>
        <span>{nearlyFireable.length} nearly</span>
        <span>active: {refTitle(v6.session, { type: 'scene', id: v6.selectedSceneId })}</span>
      </footer>

      {showOnboarding && <OrientationOverlay onClose={closeOnboarding} />}
    </div>
  )
}
