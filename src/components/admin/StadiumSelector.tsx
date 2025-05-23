import { useState, useMemo } from 'react';
import { AnimatePresence } from 'framer-motion';
import { Plus, MapPin, Users, Search } from 'lucide-react';
import { AddStadiumModal } from './AddStadiumModal';
import { Stadium } from '../../hooks/useStadiums';

interface StadiumSelectorProps {
  stadiums: Stadium[];
  selectedStadium?: string;
  onStadiumSelect: (stadiumId: string) => void;
  onAddStadium: (stadiumData: Stadium) => void;
}

export function StadiumSelector({
  stadiums,
  selectedStadium,
  onStadiumSelect,
  onAddStadium
}: StadiumSelectorProps) {
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showAllStadiums, ] = useState(false);

  // Filtrar estadios basado en la búsqueda
  const filteredStadiums = useMemo(() => {
    return stadiums.filter(
      stadium => 
        stadium.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
        stadium.city.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [stadiums, searchQuery]);

  // Limitar la visualización a 2 estadios inicialmente
  const displayedStadiums = showAllStadiums 
    ? filteredStadiums 
    : filteredStadiums.slice(0, 2);

  return (
    <>
      <div className="space-y-6">
        <h3 className="text-lg font-semibold mb-4">Seleccionar Estadio</h3>
        <div className="flex items-center px-4 py-2 border rounded-xl mb-4">
          <Search className="w-5 h-5 text-neutral-400 mr-2" />
          <input
            type="text"
            placeholder="Buscar estadio..."
            className="flex-1 outline-none"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {displayedStadiums.map((stadium) => (
            <button
              key={stadium.id}
              onClick={() => onStadiumSelect(stadium.id)}
              className={`
                p-4 rounded-xl border-2 transition-all text-left
                ${selectedStadium === stadium.id
                  ? 'border-primary bg-primary-50'
                  : 'border-neutral-200 hover:border-neutral-300'
                }
              `}
            >
              <div className="space-y-4">
                <h4 className="font-medium">{stadium.name}</h4>
                <div className="flex items-center gap-4 text-sm text-neutral-600">
                  <div className="flex items-center gap-2">
                    <MapPin className="w-4 h-4" />
                    <span>{stadium.city}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Users className="w-4 h-4" />
                    <span>{stadium.capacity.toLocaleString()}</span>
                  </div>
                </div>
              </div>
            </button>
          ))}
          
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="p-4 border-2 border-dashed border-neutral-300 rounded-xl hover:border-primary hover:bg-primary-50 transition-colors"
          >
            <div className="flex flex-col items-center gap-2">
              <div className="w-12 h-12 bg-neutral-100 rounded-lg flex items-center justify-center">
                <Plus className="w-6 h-6 text-neutral-400" />
              </div>
              <span className="text-sm text-neutral-600">Añadir Estadio</span>
            </div>
          </button>
        </div>
      </div>

      <AnimatePresence>
        {isAddModalOpen && (
          <AddStadiumModal
            onClose={() => setIsAddModalOpen(false)}
            onSave={(stadiumData) => {
              onAddStadium(stadiumData);
              setIsAddModalOpen(false);
            }}
          />
        )}
      </AnimatePresence>
    </>
  );
}