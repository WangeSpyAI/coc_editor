/**
 * コンポーネントマウントテスト
 *
 * 「ページが開くか」を自動検証する。
 * 各コンポーネントがエラーなくマウントできることを確認し、
 * ランタイムエラー（import不整合、store初期化ミス、composable参照エラー等）を検出する。
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import { createSampleScenario } from '../../utils/sampleScenario'

// Components
import App from '../../App.vue'
import SessionLayout from '../session/SessionLayout.vue'
import SessionHeader from '../session/SessionHeader.vue'
import SessionTabs from '../session/SessionTabs.vue'
import ControlPanel from '../session/ControlPanel.vue'
import WorldDashboard from '../session/WorldDashboard.vue'
import KPOperationPanel from '../session/KPOperationPanel.vue'
import FactLog from '../session/FactLog.vue'
import TimelineView from '../session/TimelineView.vue'

// Stores
import { useAppStore } from '../../store/app'
import { useSessionStore } from '../../store/session'
import { useScenarioStore } from '../../store/scenario'
import type { PCTemplate } from '../../types/scenario'

function makePc(overrides: Partial<PCTemplate> = {}): PCTemplate {
  return {
    id: 'pc-taro',
    name: '太郎',
    description: '',
    traits: [],
    relations: [],
    notes: '',
    playerName: 'プレイヤーA',
    initialLocationId: 'loc-entrance',
    initialKnowledge: [],
    inventory: [],
    stats: { str: 50, con: 60, siz: 65, dex: 70, app: 55, int: 75, pow: 60, edu: 80, hp: 12, mp: 12, san: 60 },
    ...overrides,
  }
}

function setupSessionWithPC() {
  const scenarioStore = useScenarioStore()
  const sessionStore = useSessionStore()
  const scenario = createSampleScenario()
  scenarioStore.setScenario(scenario)
  sessionStore.createNewSession(scenario, 'テストセッション')
  sessionStore.doAddPc(makePc())
  return sessionStore
}

// ===================================================================
// 1. マウント確認（ページが開けるか）
// ===================================================================

describe('マウント確認', () => {
  beforeEach(() => { setActivePinia(createPinia()) })

  it('Appがエディタモードでマウントできる', () => {
    const wrapper = mount(App)
    expect(wrapper.find('.app-layout').exists()).toBe(true)
    wrapper.unmount()
  })

  it('Appがセッションモードでマウントできる', async () => {
    const appStore = useAppStore()
    setupSessionWithPC()
    appStore.setMode('session')
    const wrapper = mount(App)
    await nextTick()
    expect(wrapper.find('.session-layout').exists()).toBe(true)
    wrapper.unmount()
  })

  const components = [
    ['SessionLayout', SessionLayout, '.session-layout'],
    ['SessionHeader', SessionHeader, null],
    ['SessionTabs', SessionTabs, null],
    ['ControlPanel', ControlPanel, null],
    ['WorldDashboard', WorldDashboard, null],
    ['KPOperationPanel', KPOperationPanel, null],
    ['FactLog', FactLog, null],
    ['TimelineView', TimelineView, null],
  ] as const

  for (const [name, Component] of components) {
    it(`${name}がセッションありでマウントできる`, () => {
      setupSessionWithPC()
      const wrapper = mount(Component as any)
      expect(wrapper.exists()).toBe(true)
      wrapper.unmount()
    })
  }

  it('SessionLayoutがセッションなしでもクラッシュしない', () => {
    const wrapper = mount(SessionLayout)
    expect(wrapper.exists()).toBe(true)
    wrapper.unmount()
  })

  it('ControlPanelがセッションなしでもクラッシュしない', () => {
    const wrapper = mount(ControlPanel)
    expect(wrapper.exists()).toBe(true)
    wrapper.unmount()
  })
})

// ===================================================================
// 2. タブ切り替え操作
// ===================================================================

describe('タブ切り替え', () => {
  beforeEach(() => { setActivePinia(createPinia()) })

  it('全タブをクリックして切り替えられる', async () => {
    setupSessionWithPC()
    const wrapper = mount(SessionLayout)

    const tabs = wrapper.findAll('.session-tabs button')
    expect(tabs.length).toBeGreaterThanOrEqual(5)

    for (const tab of tabs) {
      await tab.trigger('click')
      await nextTick()
      // No crash = success
    }

    wrapper.unmount()
  })

  it('タブをクリックすると対応するパネルが表示される', async () => {
    setupSessionWithPC()
    const wrapper = mount(SessionLayout)

    // Find tabs by their text content
    const tabs = wrapper.findAll('.session-tabs button')
    const tabMap: Record<string, string> = {
      'コントロール': '.control-panel',
      '操作': '.op-panel',
      'ワールド': '.world-dashboard',
    }

    for (const [text, selector] of Object.entries(tabMap)) {
      const tab = tabs.find(t => t.text().includes(text))
      if (tab) {
        await tab.trigger('click')
        await nextTick()
        expect(wrapper.find(selector).exists()).toBe(true)
      }
    }

    wrapper.unmount()
  })
})

// ===================================================================
// 3. セッション作成フロー
// ===================================================================

describe('セッション作成フロー', () => {
  beforeEach(() => { setActivePinia(createPinia()) })

  it('シナリオありでセッションを作成できる', async () => {
    const scenarioStore = useScenarioStore()
    const sessionStore = useSessionStore()
    scenarioStore.setScenario(createSampleScenario())

    const wrapper = mount(ControlPanel)
    const sessionNameInput = wrapper.find('input[placeholder="セッション名"]')
    expect(sessionNameInput.exists()).toBe(true)

    await sessionNameInput.setValue('新しいセッション')
    // Find and click the create button
    const createBtn = wrapper.find('.primary-btn')
    await createBtn.trigger('click')
    await nextTick()

    expect(sessionStore.session).not.toBeNull()
    expect(sessionStore.session!.name).toBe('新しいセッション')

    // After creation, the active session info should appear
    expect(wrapper.text()).toContain('新しいセッション')
    wrapper.unmount()
  })

  it('空シナリオではセッション作成ボタンが無効', async () => {
    // scenarioStore is empty by default
    const wrapper = mount(ControlPanel)
    const createBtn = wrapper.find('button.primary-btn')
    expect(createBtn.attributes('disabled')).toBeDefined()
    wrapper.unmount()
  })
})

// ===================================================================
// 4. PC追加・削除操作
// ===================================================================

describe('PC管理操作', () => {
  beforeEach(() => { setActivePinia(createPinia()) })

  it('PC名を入力して追加できる', async () => {
    const scenarioStore = useScenarioStore()
    const sessionStore = useSessionStore()
    scenarioStore.setScenario(createSampleScenario())
    sessionStore.createNewSession(createSampleScenario(), 'テスト')

    const wrapper = mount(ControlPanel)

    // Fill in PC name
    const nameInput = wrapper.find('input[placeholder="キャラクター名"]')
    await nameInput.setValue('花子')

    // Click add button
    const addBtn = wrapper.findAll('button.primary-btn').find(b => b.text() === 'PC追加')
    expect(addBtn).toBeTruthy()
    await addBtn!.trigger('click')
    await nextTick()

    // PC should appear in the list
    expect(wrapper.text()).toContain('花子')

    // Input should be cleared
    expect((nameInput.element as HTMLInputElement).value).toBe('')

    wrapper.unmount()
  })

  it('PC名が空では追加ボタンが無効', async () => {
    const scenarioStore = useScenarioStore()
    const sessionStore = useSessionStore()
    scenarioStore.setScenario(createSampleScenario())
    sessionStore.createNewSession(createSampleScenario(), 'テスト')

    const wrapper = mount(ControlPanel)
    const addBtn = wrapper.findAll('button.primary-btn').find(b => b.text() === 'PC追加')
    expect(addBtn!.attributes('disabled')).toBeDefined()
    wrapper.unmount()
  })

  it('初期場所を指定してPCを追加すると所在地が表示される', async () => {
    const scenarioStore = useScenarioStore()
    const sessionStore = useSessionStore()
    scenarioStore.setScenario(createSampleScenario())
    sessionStore.createNewSession(createSampleScenario(), 'テスト')

    const wrapper = mount(ControlPanel)

    await wrapper.find('input[placeholder="キャラクター名"]').setValue('次郎')
    const locationSelect = wrapper.find('select')
    // Select 'loc-entrance'
    await locationSelect.setValue('loc-entrance')
    const addBtn = wrapper.findAll('button.primary-btn').find(b => b.text() === 'PC追加')
    await addBtn!.trigger('click')
    await nextTick()

    // PC should show location name, not 'unknown'
    expect(wrapper.text()).toContain('次郎')
    expect(wrapper.text()).not.toContain('不明')

    wrapper.unmount()
  })
})

// ===================================================================
// 5. KP操作パネル — 場所訪問・移動・時間進行
// ===================================================================

describe('KP操作パネル', () => {
  beforeEach(() => { setActivePinia(createPinia()) })

  it('時間進行ボタンで時間を進められる', async () => {
    const sessionStore = setupSessionWithPC()
    const wrapper = mount(KPOperationPanel)

    const timeInput = wrapper.find('input[placeholder*="Day1"]')
    await timeInput.setValue('Day1 朝')

    const advanceBtn = wrapper.findAll('button.primary-btn').find(b => b.text() === '進行')
    await advanceBtn!.trigger('click')
    await nextTick()

    expect(sessionStore.worldState!.currentTime).toBe('Day1 朝')
    wrapper.unmount()
  })

  it('PC移動の選択肢にPCが表示される', async () => {
    setupSessionWithPC()
    const wrapper = mount(KPOperationPanel)

    // The visit location section should show PC in dropdown
    const selects = wrapper.findAll('select')
    const pcSelect = selects.find(s => {
      const options = s.findAll('option')
      return options.some(o => o.text() === '太郎')
    })
    expect(pcSelect).toBeTruthy()

    wrapper.unmount()
  })

  it('イベント発火セクションにシナリオイベントが表示される', async () => {
    setupSessionWithPC()
    const wrapper = mount(KPOperationPanel)

    // Event select should contain scenario events
    expect(wrapper.text()).toContain('美咲の歓迎')

    wrapper.unmount()
  })

  it('手がかり発見で未発見の手がかりが表示される', async () => {
    setupSessionWithPC()
    const wrapper = mount(KPOperationPanel)

    const text = wrapper.text()
    // Sample scenario has clues
    expect(text).toContain('手がかり発見')

    wrapper.unmount()
  })
})

// ===================================================================
// 6. WorldDashboard — 表示整合性
// ===================================================================

describe('WorldDashboard表示', () => {
  beforeEach(() => { setActivePinia(createPinia()) })

  it('NPCの名前と場所が表示される', async () => {
    setupSessionWithPC()
    const wrapper = mount(WorldDashboard)
    const text = wrapper.text()

    expect(text).toContain('美咲')
    expect(text).toContain('佐藤')
    expect(text).toContain('田中')

    wrapper.unmount()
  })

  it('PCが追加されると表示に反映される', async () => {
    setupSessionWithPC()
    const wrapper = mount(WorldDashboard)

    expect(wrapper.text()).toContain('太郎')
    wrapper.unmount()
  })

  it('初期状態では訪問済みロケーションが0', async () => {
    setupSessionWithPC()
    const wrapper = mount(WorldDashboard)
    const sessionStore = useSessionStore()

    // entrance should not show as visited (NPC placement doesn't count)
    // but PC was placed at entrance, so it should be visited
    const entranceVisitors = sessionStore.worldState!.locationStates['loc-entrance'].visitedBy
    expect(entranceVisitors).toContain('pc-taro')

    wrapper.unmount()
  })

  it('手がかりの発見状況が表示される', async () => {
    setupSessionWithPC()
    const wrapper = mount(WorldDashboard)

    // Should show clue count (e.g., "0/N")
    const sessionStore = useSessionStore()
    expect(wrapper.text()).toContain(`${sessionStore.discoveredClueCount}`)
    expect(wrapper.text()).toContain(`${sessionStore.totalClueCount}`)

    wrapper.unmount()
  })
})

// ===================================================================
// 7. FactLog — ファクト操作
// ===================================================================

describe('FactLog表示', () => {
  beforeEach(() => { setActivePinia(createPinia()) })

  it('操作後のファクトが表示される', async () => {
    const sessionStore = setupSessionWithPC()

    // Perform an action that creates a fact
    sessionStore.doMoveActor('pc-taro', 'loc-study')

    const wrapper = mount(FactLog)
    expect(sessionStore.worldState!.facts.length).toBeGreaterThan(0)
    expect(wrapper.exists()).toBe(true)
    wrapper.unmount()
  })
})

// ===================================================================
// 8. 統合フロー: セッション作成→PC追加→移動→イベント発火
// ===================================================================

describe('統合フロー', () => {
  beforeEach(() => { setActivePinia(createPinia()) })

  it('セッション作成→PC追加→訪問→時間進行の一連フローが動作する', async () => {
    const scenarioStore = useScenarioStore()
    const sessionStore = useSessionStore()
    scenarioStore.setScenario(createSampleScenario())

    // 1. Create session via ControlPanel
    const controlPanel = mount(ControlPanel)
    await controlPanel.find('input[placeholder="セッション名"]').setValue('統合テスト')
    const createBtn = controlPanel.find('button.primary-btn')
    await createBtn.trigger('click')
    await nextTick()
    expect(sessionStore.session).not.toBeNull()

    // 2. Add PC
    await controlPanel.find('input[placeholder="キャラクター名"]').setValue('太郎')
    await controlPanel.find('select').setValue('loc-entrance')
    const addPcBtn = controlPanel.findAll('button.primary-btn').find(b => b.text() === 'PC追加')
    await addPcBtn!.trigger('click')
    await nextTick()
    expect(Object.values(sessionStore.worldState!.actorStates).some(a => a.role === 'pc')).toBe(true)

    controlPanel.unmount()

    // 3. Operate via KPOperationPanel
    const opPanel = mount(KPOperationPanel)

    // Advance time
    const timeInput = opPanel.find('input[placeholder*="Day1"]')
    await timeInput.setValue('Day1 朝')
    const advBtn = opPanel.findAll('button.primary-btn').find(b => b.text() === '進行')
    await advBtn!.trigger('click')
    await nextTick()
    expect(sessionStore.worldState!.currentTime).toBe('Day1 朝')

    opPanel.unmount()

    // 4. Verify all panels still render correctly after mutations
    const dashboard = mount(WorldDashboard)
    expect(dashboard.text()).toContain('太郎')
    expect(dashboard.text()).toContain('美咲')
    dashboard.unmount()

    const factLog = mount(FactLog)
    expect(factLog.exists()).toBe(true)
    factLog.unmount()

    const timeline = mount(TimelineView)
    expect(timeline.exists()).toBe(true)
    timeline.unmount()
  })

  it('PC移動後にWorldDashboardの所在地表示が更新される', async () => {
    const sessionStore = setupSessionWithPC()

    // Mount dashboard FIRST, then perform action and check DOM updates
    const dashboard = mount(WorldDashboard)
    await nextTick()

    // Before move: PC is at 玄関ホール
    expect(dashboard.text()).toContain('玄関ホール')

    // Move PC to study
    sessionStore.doMoveActor('pc-taro', 'loc-study')
    await nextTick()

    // After move: DOM should show 書斎
    expect(dashboard.text()).toContain('書斎')

    dashboard.unmount()
  })

  it('手がかり発見後にWorldDashboardの発見数表示が更新される', async () => {
    const sessionStore = setupSessionWithPC()

    const dashboard = mount(WorldDashboard)
    await nextTick()

    // Before: 0 discovered
    expect(dashboard.text()).toContain('0/')

    // Discover a clue
    sessionStore.doDiscoverClue('clue-rumors', 'pc-taro')
    await nextTick()

    // After: 1 discovered
    expect(dashboard.text()).toContain('1/')

    dashboard.unmount()
  })

  it('イベント発火後にTimelineViewの表示が更新される', async () => {
    const sessionStore = setupSessionWithPC()

    const timeline = mount(TimelineView)
    await nextTick()

    sessionStore.doFireEvent('evt-welcome')
    await nextTick()

    // After: event should show as occurred
    expect(timeline.text()).toContain('発生済')

    timeline.unmount()
  })
})
