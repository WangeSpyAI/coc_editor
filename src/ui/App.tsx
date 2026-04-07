import { useMemo, useCallback, useState } from 'react'
import './styles.css'
import { useScenario } from '../hooks/useScenario'
import { EntityTree } from './EntityTree'
import { LocationView } from './LocationView'
import { DetailPanel } from './DetailPanel'
import { DependencyGraph } from './DependencyGraph'
import { LiveEditor } from './LiveEditor'
import { sampleScenario } from '../core/sampleScenario'
import type { Entity } from '../core/types'

type MainView = 'location' | 'graph'
type MobileTab = 'tree' | 'main' | 'detail'

export function App() {
  const {
    session,
    loadScenario,
    selectEntity,
    doAction,
    setCategoryValue,
    applyAdHoc,
    addEntity,
    addAction,
    addTrigger,
    resetWorld,
    clearSession,
    getPending,
  } = useScenario()

  const [mainView, setMainView] = useState<MainView>('location')
  const [mobileTab, setMobileTab] = useState<MobileTab>('main')

  const entityMap = useMemo(() => {
    if (!session) return new Map<string, Entity>()
    const m = new Map<string, Entity>()
    for (const e of session.scenario.entities) m.set(e.id, e)
    return m
  }, [session?.scenario.entities])

  const selectedEntity = useMemo(
    () => (session?.selectedEntityId ? entityMap.get(session.selectedEntityId) : undefined),
    [session?.selectedEntityId, entityMap],
  )

  const pendingTriggers = useMemo(
    () => (session ? getPending() : []),
    [session, getPending],
  )

  const handleAction = useCallback((actionId: string) => {
    doAction(actionId, 'PC')
  }, [doAction])

  const handleNavigate = useCallback((entityId: string) => {
    selectEntity(entityId)
    setMobileTab('main')
  }, [selectEntity])

  const handleMobileSelect = useCallback((entityId: string) => {
    selectEntity(entityId)
    setMobileTab('main')
  }, [selectEntity])

  // No session: show landing
  if (!session) {
    return (
      <div className="empty-state" style={{ height: '100vh' }}>
        <h1 style={{ color: 'var(--accent)', fontSize: 24 }}>Scenario Editor</h1>
        <p>シナリオを読み込んで開始</p>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-primary" onClick={() => loadScenario(sampleScenario)}>
            サンプルシナリオを開く
          </button>
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

        <div className="view-tabs">
          <button
            className={`view-tab${mainView === 'location' ? ' active' : ''}`}
            onClick={() => setMainView('location')}
          >
            場所
          </button>
          <button
            className={`view-tab${mainView === 'graph' ? ' active' : ''}`}
            onClick={() => setMainView('graph')}
          >
            依存グラフ
          </button>
        </div>

        {pendingTriggers.length > 0 && (
          <span style={{ color: 'var(--warning)', fontSize: 12 }}>
            待機中: {pendingTriggers.length}
          </span>
        )}
        <div className="header-actions">
          <button className="btn btn-sm" onClick={resetWorld}>リセット</button>
          <button className="btn btn-sm btn-danger" onClick={clearSession}>閉じる</button>
        </div>
      </header>

      {/* Mobile tab bar */}
      <div className="mobile-tabs">
        <button
          className={`mobile-tab${mobileTab === 'tree' ? ' active' : ''}`}
          onClick={() => setMobileTab('tree')}
        >
          ツリー
        </button>
        <button
          className={`mobile-tab${mobileTab === 'main' ? ' active' : ''}`}
          onClick={() => setMobileTab('main')}
        >
          {mainView === 'graph' ? 'グラフ' : '場所'}
        </button>
        <button
          className={`mobile-tab${mobileTab === 'detail' ? ' active' : ''}`}
          onClick={() => setMobileTab('detail')}
        >
          詳細
        </button>
      </div>

      {/* Sidebar: Entity Tree */}
      <div className={`sidebar${mobileTab === 'tree' ? ' mobile-visible' : ''}`}>
        <EntityTree
          scenario={scenario}
          worldState={worldState}
          selectedId={session.selectedEntityId}
          onSelect={handleMobileSelect}
        />
      </div>

      {/* Main Panel */}
      <div className={`main-panel${mobileTab === 'main' ? ' mobile-visible' : ''}`}>
        {mainView === 'graph' ? (
          <DependencyGraph
            scenario={scenario}
            worldState={worldState}
            onSelectEntity={handleNavigate}
          />
        ) : selectedEntity ? (
          <>
            <LocationView
              entity={selectedEntity}
              scenario={scenario}
              worldState={worldState}
              onAction={handleAction}
              onNavigate={handleNavigate}
              onSetCategory={setCategoryValue}
            />
            <LiveEditor
              scenario={scenario}
              selectedEntityId={session.selectedEntityId}
              onAddEntity={addEntity}
              onAddAction={addAction}
              onAddTrigger={addTrigger}
              onApplyEffect={applyAdHoc}
            />
          </>
        ) : (
          <div className="empty-state">
            <p>左のツリーからエンティティを選択</p>
          </div>
        )}
      </div>

      {/* Right: Detail Panel */}
      <div className={`detail-panel${mobileTab === 'detail' ? ' mobile-visible' : ''}`}>
        {selectedEntity ? (
          <DetailPanel
            entity={selectedEntity}
            scenario={scenario}
            worldState={worldState}
            onSetCategory={setCategoryValue}
          />
        ) : (
          <div className="empty-state">
            <p>エンティティを選択すると詳細が表示されます</p>
            {pendingTriggers.length > 0 && (
              <div className="pending-section" style={{ width: '100%' }}>
                <div className="detail-section">
                  <h4>待機中トリガー（あと1条件）</h4>
                </div>
                {pendingTriggers.map(({ trigger, entity }) => (
                  <div key={trigger.id} className="pending-trigger" style={{ cursor: 'pointer' }} onClick={() => handleNavigate(entity.id)}>
                    <div className="trigger-name">{trigger.name}</div>
                    <div className="unmet" style={{ fontSize: 11 }}>{entity.name}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
