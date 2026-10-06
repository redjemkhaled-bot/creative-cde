import { createRoot } from 'react-dom/client'
import { App } from './App'
import './styles.css'
import { useStore } from './store'

// Handle for automated UI tests (see RC_EVAL in the main process).
;(window as unknown as { __rc: typeof useStore }).__rc = useStore

createRoot(document.getElementById('root')!).render(<App />)
