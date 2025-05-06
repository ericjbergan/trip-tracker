import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Map from './components/Map';

const queryClient = new QueryClient();

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <div className="h-screen w-screen flex flex-col">
        <header className="bg-blue-600 text-white p-4">
          <h1 className="text-2xl font-bold">Trip Tracker</h1>
        </header>
        <main className="flex-1">
          <Map />
        </main>
      </div>
    </QueryClientProvider>
  );
}

export default App;
