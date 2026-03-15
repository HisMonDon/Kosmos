//import { useState } from 'react'
import './App.css'

function App() {
  //const [count, setCount] = useState(0)

  return (
    <>
      <div className="columncenter" style={{ padding: '30px' }}>
        <div className="rowstart">
          <span style={{ fontSize: '32px', fontWeight: 'bold', color: '#b568f0' }}>
            Kosmos
          </span>
          <div className="ticks"></div>
        </div>

        <div className="rowcenter">

          <section>
            {/* <div className="hero">
            </div> */}
            <div className="columnstart">
            </div>
          </section>
        </div>
      </div>
      <section id="spacer"></section>
    </>
  )
}

export default App
