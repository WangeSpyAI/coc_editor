import { useScenario } from '../store/ScenarioContext';
import type { ScenarioElementType } from '../types/scenario';

const tabs: { key: ScenarioElementType | 'overview'; label: string }[] = [
  { key: 'overview', label: '概要' },
  { key: 'scene', label: 'シーン' },
  { key: 'npc', label: 'NPC' },
  { key: 'location', label: '場所' },
  { key: 'clue', label: '手がかり' },
  { key: 'event', label: 'イベント' },
];

export function Sidebar() {
  const { state, dispatch } = useScenario();
  const { scenario, activeTab, selectedElement } = state;

  const getItems = (tab: ScenarioElementType) => {
    switch (tab) {
      case 'npc': return scenario.npcs;
      case 'location': return scenario.locations;
      case 'clue': return scenario.clues;
      case 'event': return scenario.events;
      case 'scene': return scenario.scenes;
    }
  };

  const handleAdd = () => {
    if (activeTab === 'overview') return;
    const actionMap: Record<ScenarioElementType, string> = {
      npc: 'ADD_NPC',
      location: 'ADD_LOCATION',
      clue: 'ADD_CLUE',
      event: 'ADD_EVENT',
      scene: 'ADD_SCENE',
    };
    dispatch({ type: actionMap[activeTab] as never });
  };

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <h2>{scenario.title}</h2>
        {state.isDirty && <span className="dirty-indicator">未保存</span>}
      </div>

      <nav className="sidebar-tabs">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            className={`tab-btn ${activeTab === tab.key ? 'active' : ''}`}
            onClick={() => dispatch({ type: 'SET_ACTIVE_TAB', payload: tab.key })}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {activeTab !== 'overview' && (
        <div className="sidebar-list">
          <button className="add-btn" onClick={handleAdd}>
            + 追加
          </button>
          <ul>
            {getItems(activeTab)?.map((item) => (
              <li
                key={item.id}
                className={selectedElement?.id === item.id ? 'selected' : ''}
                onClick={() => dispatch({ type: 'SELECT_ELEMENT', payload: { type: activeTab, id: item.id } })}
              >
                {item.name}
              </li>
            ))}
          </ul>
        </div>
      )}
    </aside>
  );
}
