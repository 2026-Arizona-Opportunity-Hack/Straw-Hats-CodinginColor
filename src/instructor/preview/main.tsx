import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createRoot } from 'react-dom/client';
import { InstructorWorkspace } from '../InstructorWorkspace';

createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={new QueryClient()}><InstructorWorkspace /></QueryClientProvider>,
);
