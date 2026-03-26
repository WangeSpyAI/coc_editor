import { useScenario } from '../store/ScenarioContext';
import type { Location } from '../types/scenario';

export function LocationEditor() {
  const { state, dispatch } = useScenario();
  const location = state.scenario.locations.find((l) => l.id === state.selectedElement?.id);

  if (!location) return <div className="editor-panel empty">場所を選択してください</div>;

  const update = (changes: Partial<Location>) => {
    dispatch({ type: 'UPDATE_LOCATION', payload: { ...location, ...changes } });
  };

  const handleDelete = () => {
    if (confirm(`「${location.name}」を削除しますか？`)) {
      dispatch({ type: 'DELETE_LOCATION', payload: location.id });
    }
  };

  return (
    <div className="editor-panel">
      <div className="editor-header">
        <h2>場所編集</h2>
        <button className="delete-btn" onClick={handleDelete}>削除</button>
      </div>

      <label className="form-full">
        名前
        <input value={location.name} onChange={(e) => update({ name: e.target.value })} />
      </label>

      <label className="form-full">
        説明
        <textarea rows={4} value={location.description} onChange={(e) => update({ description: e.target.value })} />
      </label>

      <div className="related-section">
        <h3>関連NPC</h3>
        <div className="chip-list">
          {location.npcIds.map((id) => {
            const npc = state.scenario.npcs.find((n) => n.id === id);
            return npc ? <span key={id} className="chip">{npc.name} <button onClick={() => update({ npcIds: location.npcIds.filter((i) => i !== id) })}>×</button></span> : null;
          })}
        </div>
        <select
          value=""
          onChange={(e) => {
            if (e.target.value && !location.npcIds.includes(e.target.value)) {
              update({ npcIds: [...location.npcIds, e.target.value] });
            }
          }}
        >
          <option value="">NPCを追加...</option>
          {state.scenario.npcs.filter((n) => !location.npcIds.includes(n.id)).map((n) => (
            <option key={n.id} value={n.id}>{n.name}</option>
          ))}
        </select>
      </div>

      <div className="related-section">
        <h3>関連手がかり</h3>
        <div className="chip-list">
          {location.clueIds.map((id) => {
            const clue = state.scenario.clues.find((c) => c.id === id);
            return clue ? <span key={id} className="chip">{clue.name} <button onClick={() => update({ clueIds: location.clueIds.filter((i) => i !== id) })}>×</button></span> : null;
          })}
        </div>
        <select
          value=""
          onChange={(e) => {
            if (e.target.value && !location.clueIds.includes(e.target.value)) {
              update({ clueIds: [...location.clueIds, e.target.value] });
            }
          }}
        >
          <option value="">手がかりを追加...</option>
          {state.scenario.clues.filter((c) => !location.clueIds.includes(c.id)).map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>

      <label className="form-full">
        メモ
        <textarea rows={3} value={location.notes} onChange={(e) => update({ notes: e.target.value })} />
      </label>
    </div>
  );
}
