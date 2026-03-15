//import { useState } from 'react'
import './App.css'
import TodoList from './widgets/todo'
import Sidebar from './widgets/sidebar'

function App() {
  //const [count, setCount] = useState(0)

  return (
    <>
      <div className="columncenter app-shell">
        <div className="rowstart app-header">
          <span className="brand-title">
            Kosmos
          </span>
          <div className="ticks"></div>
        </div>
        <div className="rowstart">
          <TodoList />
          <div style={{ padding: '20px' }}>
          </div>
          <Sidebar />
        </div>
      </div>
      <section id="spacer"></section>
    </>
  )
}

export default App
