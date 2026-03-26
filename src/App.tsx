import { ScenarioProvider, useScenario } from './store/ScenarioContext';
import { Sidebar } from './components/Sidebar';
import { OverviewEditor } from './components/OverviewEditor';
import { NPCEditor } from './components/NPCEditor';
import { LocationEditor } from './components/LocationEditor';
import { ClueEditor } from './components/ClueEditor';
import { EventEditor } from './components/EventEditor';
import { SceneEditor } from './components/SceneEditor';
import './App.css';

function EditorContent() {
  const { state } = useScenario();

  const renderEditor = () => {
    switch (state.activeTab) {
      case 'overview': return <OverviewEditor />;
      case 'npc': return <NPCEditor />;
      case 'location': return <LocationEditor />;
      case 'clue': return <ClueEditor />;
      case 'event': return <EventEditor />;
      case 'scene': return <SceneEditor />;
    }
  };

  return (
    <div className="app-layout">
      <Sidebar />
      <main className="editor-main">
        {renderEditor()}
      </main>
    </div>
  );
}

function App() {
  return (
    <ScenarioProvider>
      <EditorContent />
    </ScenarioProvider>
  );
}

export default App;
