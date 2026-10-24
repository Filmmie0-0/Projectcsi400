import { RouterProvider } from 'react-router-dom';
import { router } from './routes';
import { useLiveSync } from './hooks/useLiveSync';

export default function App() {
  useLiveSync();
  return <RouterProvider router={router} />;
}
