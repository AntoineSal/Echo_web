import { useState, useEffect } from 'react'
import { Platform } from 'react-native'
import { createLogger } from '@mobile/utils/logger'
import './App.css'

const logger = createLogger('EchoWeb');

function App() {
  const [os, setOs] = useState('')

  useEffect(() => {
    setOs(Platform.OS)
    logger.info('Echo Web application started successfully!');
  }, [])

  return (
    <>
      <h1>Echo Web</h1>
      <div className="card">
        <p>
          Running on: <strong>{os}</strong>
        </p>
        <p>
          Check the console! The @mobile alias logger was executed.
        </p>
      </div>
    </>
  )
}

export default App
