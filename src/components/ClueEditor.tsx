import { useScenario } from '../store/ScenarioContext';
import type { Clue } from '../types/scenario';

export function ClueEditor() {
  const { state, dispatch } = useScenario();
  const clue = state.scenario.clues.find((c) => c.id === state.selectedElement?.id);

  if (!clue) return <div className="editor-panel empty">手がかりを選択してください</div>;

  const update = (changes: Partial<Clue>) => {
    dispatch({ type: 'UPDATE_CLUE', payload: { ...clue, ...changes } });
  };

  const handleDelete = () => {
    if (confirm(`「${clue.name}」を削除しますか？`)) {
      dispatch({ type: 'DELETE_CLUE', payload: clue.id });
    }
  };

  return (
    <div className="editor-panel">
      <div className="editor-header">
        <h2>手がかり編集</h2>
        <button className="delete-btn" onClick={handleDelete}>削除</button>
      </div>

      <div className="form-grid">
        <label>
          名前
          <input value={clue.name} onChange={(e) => update({ name: e.target.value })} />
        </label>
        <label className="checkbox-label">
          <input type="checkbox" checked={clue.isKey} onChange={(e) => update({ isKey: e.target.checked })} />
          重要な手がかり
        </label>
      </div>

      <label className="form-full">
        発見場所
        <select
          value={clue.locationId ?? ''}
          onChange={(e) => update({ locationId: e.target.value || undefined })}
        >
          <option value="">未設定</option>
          {state.scenario.locations.map((l) => (
            <option key={l.id} value={l.id}>{l.name}</option>
          ))}
        </select>
      </label>

      <label className="form-full">
        説明
        <textarea rows={4} value={clue.description} onChange={(e) => update({ description: e.target.value })} />
      </label>

      <label className="form-full">
        メモ
        <textarea rows={3} value={clue.notes} onChange={(e) => update({ notes: e.target.value })} />
      </label>
    </div>
  );
}
