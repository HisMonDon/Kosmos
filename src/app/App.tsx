import { useEffect, useState } from 'react'
import './App.css'
import TodoList from '../widgets/tasks/TodoList'
import Sidebar, { type WidgetId } from '../widgets/sidebar/Sidebar'
import FocusWidget from '../widgets/focus/FocusWidget'
import ScreenTimeWidget from '../widgets/screen-time/ScreenTimeWidget'

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
        <div className="app-header rowstart">
          <span className="brand-title">Kosmos</span>
          <span className="brand-studio">Chenyu Lu IB EE</span>
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
