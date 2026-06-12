import { useMemo, useCallback, useState, useRef } from 'react'
import './styles.css'
import { useScenario, type PersistedSession } from '../hooks/useScenario'
import { EntityTree } from './EntityTree'
import { EntityPanel } from './EntityPanel'
import { PartyBar } from './PartyBar'
import { LiveEditor } from './LiveEditor'
import { LogPane } from './LogPane'
import { PendingDropdown, PendingList } from './PendingPanel'
import { sampleScenario } from '../core/sampleScenario'
import type { Entity, Scenario } from '../core/types'

/**
 * セッションエクスポート形式の最小形状チェック。
 * scenario.entities が配列・worldState.entityStates がオブジェクトであることだけ確認する —
 * importSession に「キーはあるが中身が別物」の JSON を渡してクラッシュさせないため。
 * 不一致なら素のシナリオ形式の判定へフォールスルーする。
 */
function isPersistedSessionShape(parsed: Record<string, unknown>): boolean {
  const scenario = parsed.scenario as { entities?: unknown } | null | undefined
  const worldState = parsed.worldState as { entityStates?: unknown } | null | undefined
  return Boolean(
    scenario && Array.isArray(scenario.entities)
    && worldState && typeof worldState.entityStates === 'object' && worldState.entityStates !== null,
  )
}

export function App() {
  const {
    session,
    selectedEntityId,
    canUndo,
    undo,
    createScenario,
    loadScenario,
    importSession,
    exportScenario,
    exportSession,
    selectEntity,
    doAction,
    moveParty,
    setActiveParty,
    splitParty,
    mergeParties,
    addToParty,
    removeFromParty,
    shareKnowledge,
    setCategoryValue,
    applyAdHoc,
    addEntity,
    updateEntity,
    removeEntity,
    addCategoryDef,
    updateCategoryDef,
    removeCategoryDef,
    addAction,
    updateAction,
    removeAction,
    addTrigger,
    updateTrigger,
    removeTrigger,
    resetWorld,
    clearSession,
    getPending,
    fulfillPendingClause,
  } = useScenario()

  const entityMap = useMemo(() => {
    if (!session) return new Map<string, Entity>()
    const m = new Map<string, Entity>()
    for (const e of session.scenario.entities) m.set(e.id, e)
    return m
  }, [session?.scenario.entities])

  const selectedEntity = useMemo(
    () => (selectedEntityId ? entityMap.get(selectedEntityId) : undefined),
    [selectedEntityId, entityMap],
  )

  const pendingTriggers = useMemo(
    () => (session ? getPending() : []),
    [session, getPending],
  )

  const handleAction = useCallback((actionId: string, actorId?: string, rollResult?: 'success' | 'failure') => {
    doAction(actionId, actorId, rollResult)
  }, [doAction])

  const handleNavigate = useCallback((entityId: string) => {
    selectEntity(entityId)
  }, [selectEntity])

  const [newTitle, setNewTitle] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleImport = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result as string) as Record<string, unknown>
        if (isPersistedSessionShape(parsed)) {
          // セッションエクスポート形式 → 進行状態ごと復元
          importSession(parsed as unknown as PersistedSession)
        } else if (parsed.entities && parsed.title) {
          // 素のシナリオ形式 → 初期状態で開始
          loadScenario(parsed as unknown as Scenario)
        }
        // どちらの形でもないファイルは何もしない（従来どおり silent no-op）
      } catch { /* invalid JSON / 未対応の保存形式 */ }
    }
    reader.readAsText(file)
  }, [loadScenario, importSession])

  const downloadJson = useCallback((json: string | null, suffix: string) => {
    if (!json) return
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${session?.scenario.title ?? 'scenario'}-${suffix}.json`
    a.click()
    URL.revokeObjectURL(url)
  }, [session?.scenario.title])

  // Landing page
  if (!session) {
    return (
      <div className="empty-state" style={{ height: '100vh' }}>
        <h1 style={{ color: 'var(--accent)', fontSize: 24 }}>Scenario Editor</h1>
        <p>シナリオを作成または読み込み</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              placeholder="シナリオ名"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && newTitle.trim()) createScenario(newTitle.trim()) }}
              style={{
                background: 'var(--bg-card)', border: '1px solid var(--border)',
                borderRadius: 'var(--radius)', color: 'var(--text)', padding: '6px 12px', fontSize: 14,
              }}
            />
            <button className="btn btn-primary" onClick={() => newTitle.trim() && createScenario(newTitle.trim())} disabled={!newTitle.trim()}>
              新規作成
            </button>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn" onClick={() => fileInputRef.current?.click()}>JSONインポート</button>
            <button className="btn" onClick={() => loadScenario(sampleScenario)}>サンプル</button>
          </div>
          <input ref={fileInputRef} type="file" accept=".json" onChange={handleImport} style={{ display: 'none' }} />
        </div>
      </div>
    )
  }

  const { scenario, worldState } = session

  return (
    <div className="app-layout">
      {/* Header */}
      <header className="app-header">
        <h1>Scenario Editor</h1>
        <span className="scenario-title">{scenario.title}</span>
        <PendingDropdown
          pending={pendingTriggers}
          scenario={scenario}
          onSelectEntity={handleNavigate}
          onFulfill={fulfillPendingClause}
        />
        {session.lastResult && !session.lastResult.reachedFixedPoint && (
          <span
            className="oscillation-badge"
            title="トリガーが上限ステップまで停止しませんでした。トリガーの循環を確認してください"
            aria-label="トリガーが上限ステップまで停止しませんでした。トリガーの循環を確認してください"
          >
            ⚠ 振動の可能性
          </span>
        )}
        <div className="header-actions">
          <button className="btn btn-sm" onClick={undo} disabled={!canUndo}>元に戻す</button>
          <button className="btn btn-sm" onClick={() => downloadJson(exportScenario(), 'scenario')}>シナリオのみ</button>
          <button className="btn btn-sm" onClick={() => downloadJson(exportSession(), 'session')}>セッション込み</button>
          <button className="btn btn-sm" onClick={resetWorld}>リセット</button>
          <button className="btn btn-sm btn-danger" onClick={clearSession}>閉じる</button>
        </div>
      </header>

      {/* Sidebar: Entity Tree */}
      <div className="layout-sidebar">
        <EntityTree
          scenario={scenario}
          worldState={worldState}
          selectedId={selectedEntityId}
          onSelect={handleNavigate}
          onAddEntity={addEntity}
          onAddToParty={addToParty}
        />
      </div>

      {/* Main: Entity Panel */}
      <div className="layout-main">
        <PartyBar
          scenario={scenario}
          worldState={worldState}
          onSetActiveParty={setActiveParty}
          onSelectEntity={selectEntity}
          onSplitParty={splitParty}
          onMergeParties={mergeParties}
          onRemoveFromParty={removeFromParty}
        />
        {selectedEntity ? (
          <>
            <EntityPanel
              entity={selectedEntity}
              scenario={scenario}
              worldState={worldState}
              onAction={handleAction}
              onNavigate={handleNavigate}
              onMoveParty={moveParty}
              onShareKnowledge={shareKnowledge}
              onSetCategory={setCategoryValue}
              onUpdateEntity={updateEntity}
              onRemoveEntity={removeEntity}
              onAddCategoryDef={addCategoryDef}
              onUpdateCategoryDef={updateCategoryDef}
              onRemoveCategoryDef={removeCategoryDef}
              onUpdateAction={updateAction}
              onRemoveAction={removeAction}
              onUpdateTrigger={updateTrigger}
              onRemoveTrigger={removeTrigger}
              onFulfill={fulfillPendingClause}
            />
            <LiveEditor
              scenario={scenario}
              selectedEntityId={selectedEntityId}
              onAddEntity={addEntity}
              onAddToParty={addToParty}
              onAddAction={addAction}
              onAddTrigger={addTrigger}
              onApplyEffect={applyAdHoc}
            />
          </>
        ) : (
          <div className="empty-state">
            <p>左のツリーからエンティティを選択</p>
            {pendingTriggers.length > 0 && (
              <div className="pending-section" style={{ width: '100%' }}>
                <div className="entity-section"><h3>待機中トリガー（あと1条件）</h3></div>
                <PendingList
                  pending={pendingTriggers}
                  scenario={scenario}
                  onSelectEntity={handleNavigate}
                  onFulfill={fulfillPendingClause}
                />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Log: 描写ログペイン（エンティティ未選択でも常時表示） */}
      <div className="layout-log">
        <LogPane log={worldState.log} scenario={scenario} />
      </div>
    </div>
  )
}
