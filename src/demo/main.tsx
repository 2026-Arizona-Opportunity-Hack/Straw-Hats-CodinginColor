import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import '../index.css'
import DemoWalkthrough from './DemoWalkthrough'

const client = new QueryClient()
createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={client}>
    <BrowserRouter><DemoWalkthrough /></BrowserRouter>
  </QueryClientProvider>,
)
