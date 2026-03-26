import { useScenario } from '../store/ScenarioContext';
import { exportScenario, importScenario } from '../utils/scenario';

export function OverviewEditor() {
  const { state, dispatch } = useScenario();
  const { scenario } = state;

  const handleChange = (field: string, value: string) => {
    dispatch({ type: 'UPDATE_OVERVIEW', payload: { [field]: value } });
  };

  const handleExport = () => {
    const json = exportScenario(scenario);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${scenario.title}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const imported = importScenario(ev.target?.result as string);
          dispatch({ type: 'SET_SCENARIO', payload: imported });
        } catch {
          alert('JSONファイルの読み込みに失敗しました。');
        }
      };
      reader.readAsText(file);
    };
    input.click();
  };

  return (
    <div className="editor-panel">
      <div className="editor-header">
        <h2>シナリオ概要</h2>
        <div className="editor-actions">
          <button onClick={handleImport}>インポート</button>
          <button onClick={handleExport}>エクスポート</button>
        </div>
      </div>

      <div className="form-grid">
        <label>
          タイトル
          <input value={scenario.title} onChange={(e) => handleChange('title', e.target.value)} />
        </label>
        <label>
          作者
          <input value={scenario.author} onChange={(e) => handleChange('author', e.target.value)} />
        </label>
        <label>
          時代設定
          <input value={scenario.era} onChange={(e) => handleChange('era', e.target.value)} />
        </label>
        <label>
          推奨人数
          <input value={scenario.playerCount} onChange={(e) => handleChange('playerCount', e.target.value)} />
        </label>
        <label>
          プレイ時間目安
          <input value={scenario.estimatedTime} onChange={(e) => handleChange('estimatedTime', e.target.value)} />
        </label>
      </div>

      <label className="form-full">
        あらすじ
        <textarea rows={4} value={scenario.synopsis} onChange={(e) => handleChange('synopsis', e.target.value)} />
      </label>
      <label className="form-full">
        背景情報
        <textarea rows={4} value={scenario.backgroundInfo} onChange={(e) => handleChange('backgroundInfo', e.target.value)} />
      </label>
      <label className="form-full">
        キーパー向けメモ
        <textarea rows={4} value={scenario.keeperNotes} onChange={(e) => handleChange('keeperNotes', e.target.value)} />
      </label>

      <div className="stats-summary">
        <span>NPC: {scenario.npcs.length}</span>
        <span>場所: {scenario.locations.length}</span>
        <span>手がかり: {scenario.clues.length}</span>
        <span>イベント: {scenario.events.length}</span>
        <span>シーン: {scenario.scenes.length}</span>
      </div>
    </div>
  );
}
