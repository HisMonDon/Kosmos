import { useEffect, useState } from 'react'
import './App.css'
import TodoList from './widgets/todo'
import Sidebar, { type WidgetId } from './widgets/sidebar'
import FocusWidget from './widgets/focus'
import ScreenTimeWidget from './widgets/screen_time/screenTime'

const FOCUS_SESSION_STORAGE_KEY = 'kosmos.focus-session-active'

function loadFocusSessionFromStorage(): boolean {
  try {
    return window.localStorage.getItem(FOCUS_SESSION_STORAGE_KEY) === 'true'
  } catch {
    return false
  }
}

function App() {
  const [isFocusSessionActive, setIsFocusSessionActive] = useState(loadFocusSessionFromStorage)
  const [selectedWidget, setSelectedWidget] = useState<WidgetId>(() => (
    loadFocusSessionFromStorage() ? 'focus' : 'tasks'
  ))

  useEffect(() => {
    if (isFocusSessionActive) {
      setSelectedWidget('focus')
    }
  }, [isFocusSessionActive])

  function handleSelectWidget(id: WidgetId) {
    if (isFocusSessionActive) {
      setSelectedWidget('focus')
      return
    }

    setSelectedWidget(id)
  }

  function renderWidget() {
    const activeWidget = isFocusSessionActive ? 'focus' : selectedWidget

    switch (activeWidget) {
      case 'focus':
        return <FocusWidget onFocusSessionChange={setIsFocusSessionActive} />
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
          <Sidebar selectedId={isFocusSessionActive ? 'focus' : selectedWidget} onSelect={handleSelectWidget} />
        </div>
      </div>
    </>
  )

}

export default App
