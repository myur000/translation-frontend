import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
// Шрифты лежат в сборке, а не грузятся со стороннего сервера и не берутся из системы:
// у читателя без них сайт выглядел бы иначе. Браузер скачивает только нужные
// алфавиты (unicode-range): для русско-английской книги — латиницу и кириллицу.
import '@fontsource-variable/golos-text/wght.css'
import '@fontsource-variable/literata/opsz.css'
import '@fontsource-variable/literata/opsz-italic.css'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
