import { useState } from 'react'
import './App.css'
import TodoList from './widgets/todo'
import Sidebar, { type WidgetId } from './widgets/sidebar'
import FocusWidget from './widgets/focus'
import ScreenTimeWidget from './widgets/screen_time/screenTime'

function App() {
  const [selectedWidget, setSelectedWidget] = useState<WidgetId>('tasks')

  function renderWidget() {
    switch (selectedWidget) {
      case 'focus':
        return <FocusWidget />
      case 'screen_time':
        return <ScreenTimeWidget />
      case 'tasks':
      default:
        return <TodoList />
    }
  }

  return (
    <>
      <div className="columncenter app-shell">
        <div className="rowstart app-header">
          <span className="brand-title">
            Kosmos
          </span>
          <div className="ticks"></div>
        </div>
        <div className="content-row">
          {renderWidget()}
          <Sidebar selectedId={selectedWidget} onSelect={setSelectedWidget} />
        </div>
      </div>
    </>
  )

}

export default App
