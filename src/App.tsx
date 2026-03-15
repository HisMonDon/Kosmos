//import { useState } from 'react'
import './App.css'
import TodoList from './widgets/todo'

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
        <div className="rowcenter content-row">
          <TodoList />
        </div>
      </div>
      <section id="spacer"></section>
    </>
  )
}

export default App
