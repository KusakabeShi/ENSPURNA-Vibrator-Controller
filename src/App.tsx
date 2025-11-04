import { Navigate, Outlet, Route, Routes, useParams } from 'react-router-dom';
import LandingPage from './pages/common/LandingPage';
import ServerPage from './pages/server/ServerPage';
import ClientConnectPage from './pages/client/ClientConnectPage';
import ClientControlPage from './pages/client/ClientControlPage';
import { ClientProvider } from './state/ClientContext';
import type { AppRole } from './state/types';

const ClientLayout = () => {
  const { role } = useParams<{ role: string }>();
  const resolvedRole: AppRole | null = role === 'admin' ? 'client-admin' : role === 'normal' ? 'client-normal' : null;

  if (!resolvedRole) {
    return <Navigate to="/" replace />;
  }

  return (
    <ClientProvider initialRole={resolvedRole}>
      <Outlet />
    </ClientProvider>
  );
};

const App = () => {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/server" element={<ServerPage />} />
      <Route path="/client/:role" element={<ClientLayout />}>
        <Route index element={<ClientConnectPage />} />
        <Route path="control" element={<ClientControlPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
};

export default App;
