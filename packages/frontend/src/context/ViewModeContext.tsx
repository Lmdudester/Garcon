import { createContext, useContext, useState, ReactNode } from 'react';

type ViewMode = 'user' | 'admin';

interface ViewModeContextType {
  viewMode: ViewMode;
  isAdmin: boolean;
  toggleViewMode: () => void;
  setViewMode: (mode: ViewMode) => void;
}

const ViewModeContext = createContext<ViewModeContextType | undefined>(undefined);

export function ViewModeProvider({ children }: { children: ReactNode }) {
  const [viewMode, setViewMode] = useState<ViewMode>('user');

  const toggleViewMode = () => {
    setViewMode(prev => prev === 'user' ? 'admin' : 'user');
  };

  const isAdmin = viewMode === 'admin';

  return (
    <ViewModeContext.Provider value={{ viewMode, isAdmin, toggleViewMode, setViewMode }}>
      {children}
    </ViewModeContext.Provider>
  );
}

export function useViewMode() {
  const context = useContext(ViewModeContext);
  if (context === undefined) {
    throw new Error('useViewMode must be used within a ViewModeProvider');
  }
  return context;
}
