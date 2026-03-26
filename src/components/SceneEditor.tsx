import { useScenario } from '../store/ScenarioContext';
import type { Scene } from '../types/scenario';

export function SceneEditor() {
  const { state, dispatch } = useScenario();
  const scene = state.scenario.scenes.find((s) => s.id === state.selectedElement?.id);

  if (!scene) return <div className="editor-panel empty">シーンを選択してください</div>;

  const update = (changes: Partial<Scene>) => {
    dispatch({ type: 'UPDATE_SCENE', payload: { ...scene, ...changes } });
  };

  const handleDelete = () => {
    if (confirm(`「${scene.name}」を削除しますか？`)) {
      dispatch({ type: 'DELETE_SCENE', payload: scene.id });
    }
  };

  const addRelation = (field: 'locationIds' | 'eventIds' | 'npcIds' | 'clueIds', id: string) => {
    if (id && !scene[field].includes(id)) {
      update({ [field]: [...scene[field], id] });
    }
  };

  const removeRelation = (field: 'locationIds' | 'eventIds' | 'npcIds' | 'clueIds', id: string) => {
    update({ [field]: scene[field].filter((i) => i !== id) });
  };

  return (
    <div className="editor-panel">
      <div className="editor-header">
        <h2>シーン編集</h2>
        <button className="delete-btn" onClick={handleDelete}>削除</button>
      </div>

      <div className="form-grid">
        <label>
          名前
          <input value={scene.name} onChange={(e) => update({ name: e.target.value })} />
        </label>
        <label>
          順序
          <input type="number" value={scene.order} onChange={(e) => update({ order: Number(e.target.value) })} />
        </label>
      </div>

      <label className="form-full">
        説明
        <textarea rows={4} value={scene.description} onChange={(e) => update({ description: e.target.value })} />
      </label>

      <div className="related-section">
        <h3>場所</h3>
        <div className="chip-list">
          {scene.locationIds.map((id) => {
            const loc = state.scenario.locations.find((l) => l.id === id);
            return loc ? <span key={id} className="chip">{loc.name} <button onClick={() => removeRelation('locationIds', id)}>×</button></span> : null;
          })}
        </div>
        <select value="" onChange={(e) => addRelation('locationIds', e.target.value)}>
          <option value="">場所を追加...</option>
          {state.scenario.locations.filter((l) => !scene.locationIds.includes(l.id)).map((l) => (
            <option key={l.id} value={l.id}>{l.name}</option>
          ))}
        </select>
      </div>

      <div className="related-section">
        <h3>NPC</h3>
        <div className="chip-list">
          {scene.npcIds.map((id) => {
            const npc = state.scenario.npcs.find((n) => n.id === id);
            return npc ? <span key={id} className="chip">{npc.name} <button onClick={() => removeRelation('npcIds', id)}>×</button></span> : null;
          })}
        </div>
        <select value="" onChange={(e) => addRelation('npcIds', e.target.value)}>
          <option value="">NPCを追加...</option>
          {state.scenario.npcs.filter((n) => !scene.npcIds.includes(n.id)).map((n) => (
            <option key={n.id} value={n.id}>{n.name}</option>
          ))}
        </select>
      </div>

      <div className="related-section">
        <h3>イベント</h3>
        <div className="chip-list">
          {scene.eventIds.map((id) => {
            const evt = state.scenario.events.find((e) => e.id === id);
            return evt ? <span key={id} className="chip">{evt.name} <button onClick={() => removeRelation('eventIds', id)}>×</button></span> : null;
          })}
        </div>
        <select value="" onChange={(e) => addRelation('eventIds', e.target.value)}>
          <option value="">イベントを追加...</option>
          {state.scenario.events.filter((e) => !scene.eventIds.includes(e.id)).map((e) => (
            <option key={e.id} value={e.id}>{e.name}</option>
          ))}
        </select>
      </div>

      <div className="related-section">
        <h3>手がかり</h3>
        <div className="chip-list">
          {scene.clueIds.map((id) => {
            const clue = state.scenario.clues.find((c) => c.id === id);
            return clue ? <span key={id} className="chip">{clue.name} <button onClick={() => removeRelation('clueIds', id)}>×</button></span> : null;
          })}
        </div>
        <select value="" onChange={(e) => addRelation('clueIds', e.target.value)}>
          <option value="">手がかりを追加...</option>
          {state.scenario.clues.filter((c) => !scene.clueIds.includes(c.id)).map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>

      <label className="form-full">
        メモ
        <textarea rows={3} value={scene.notes} onChange={(e) => update({ notes: e.target.value })} />
      </label>
    </div>
  );
}
