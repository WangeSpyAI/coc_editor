import { useScenario } from '../store/ScenarioContext';
import type { Event } from '../types/scenario';

export function EventEditor() {
  const { state, dispatch } = useScenario();
  const event = state.scenario.events.find((e) => e.id === state.selectedElement?.id);

  if (!event) return <div className="editor-panel empty">イベントを選択してください</div>;

  const update = (changes: Partial<Event>) => {
    dispatch({ type: 'UPDATE_EVENT', payload: { ...event, ...changes } });
  };

  const handleDelete = () => {
    if (confirm(`「${event.name}」を削除しますか？`)) {
      dispatch({ type: 'DELETE_EVENT', payload: event.id });
    }
  };

  return (
    <div className="editor-panel">
      <div className="editor-header">
        <h2>イベント編集</h2>
        <button className="delete-btn" onClick={handleDelete}>削除</button>
      </div>

      <label className="form-full">
        名前
        <input value={event.name} onChange={(e) => update({ name: e.target.value })} />
      </label>

      <label className="form-full">
        トリガー条件
        <textarea rows={2} value={event.trigger} onChange={(e) => update({ trigger: e.target.value })} />
      </label>

      <label className="form-full">
        説明
        <textarea rows={4} value={event.description} onChange={(e) => update({ description: e.target.value })} />
      </label>

      <label className="form-full">
        結果・影響
        <textarea rows={3} value={event.outcome} onChange={(e) => update({ outcome: e.target.value })} />
      </label>

      <label className="form-full">
        メモ
        <textarea rows={3} value={event.notes} onChange={(e) => update({ notes: e.target.value })} />
      </label>
    </div>
  );
}
