import { useScenario } from '../store/ScenarioContext';
import type { NPC } from '../types/scenario';

const defaultStats = (): NonNullable<NPC['stats']> => ({
  str: 50, con: 50, siz: 50, dex: 50, app: 50,
  int: 50, pow: 50, edu: 50, hp: 10, mp: 10, san: 50,
});

export function NPCEditor() {
  const { state, dispatch } = useScenario();
  const npc = state.scenario.npcs.find((n) => n.id === state.selectedElement?.id);

  if (!npc) return <div className="editor-panel empty">NPCを選択してください</div>;

  const update = (changes: Partial<NPC>) => {
    dispatch({ type: 'UPDATE_NPC', payload: { ...npc, ...changes } });
  };

  const handleDelete = () => {
    if (confirm(`「${npc.name}」を削除しますか？`)) {
      dispatch({ type: 'DELETE_NPC', payload: npc.id });
    }
  };

  return (
    <div className="editor-panel">
      <div className="editor-header">
        <h2>NPC編集</h2>
        <button className="delete-btn" onClick={handleDelete}>削除</button>
      </div>

      <div className="form-grid">
        <label>
          名前
          <input value={npc.name} onChange={(e) => update({ name: e.target.value })} />
        </label>
        <label>
          年齢
          <input type="number" value={npc.age ?? ''} onChange={(e) => update({ age: e.target.value ? Number(e.target.value) : undefined })} />
        </label>
        <label>
          職業
          <input value={npc.occupation ?? ''} onChange={(e) => update({ occupation: e.target.value })} />
        </label>
      </div>

      <label className="form-full">
        説明
        <textarea rows={3} value={npc.description} onChange={(e) => update({ description: e.target.value })} />
      </label>

      <div className="stats-section">
        <h3>
          能力値
          {!npc.stats && (
            <button className="small-btn" onClick={() => update({ stats: defaultStats() })}>
              能力値を追加
            </button>
          )}
        </h3>
        {npc.stats && (
          <div className="stats-grid">
            {(Object.keys(npc.stats) as (keyof typeof npc.stats)[]).map((key) => (
              <label key={key}>
                {key.toUpperCase()}
                <input
                  type="number"
                  value={npc.stats![key]}
                  onChange={(e) => update({ stats: { ...npc.stats!, [key]: Number(e.target.value) } })}
                />
              </label>
            ))}
          </div>
        )}
      </div>

      <label className="form-full">
        メモ
        <textarea rows={3} value={npc.notes} onChange={(e) => update({ notes: e.target.value })} />
      </label>
    </div>
  );
}
