import React from 'react';
import { usePOS } from '../../context/POSContext.tsx';
import { Wine, Utensils, Beer, Sparkles, GlassWater, Flame, Coffee, Layers, BedDouble } from 'lucide-react';

export const CategorySidebar: React.FC = () => {
  const {
    categories,
    selectedCategory,
    setSelectedCategory,
    rooms,
  } = usePOS();

  // Helper icons for categories
  const getCategoryIcon = (name: string, type: string) => {
    const lower = name.toLowerCase();
    if (lower.includes('arrack') || lower.includes('whisky') || lower.includes('brandy') || lower.includes('rum') || lower.includes('vodka') || lower.includes('gin') || lower.includes('wine')) {
      return Wine;
    }
    if (lower.includes('beer')) {
      return Beer;
    }
    if (lower.includes('bite') || lower.includes('rice') || lower.includes('kottu') || lower.includes('food') || lower.includes('snack') || lower.includes('mains')) {
      return Utensils;
    }
    if (lower.includes('soft') || lower.includes('drink') || lower.includes('water') || lower.includes('beverage')) {
      return GlassWater;
    }
    if (type === 'bar') return Wine;
    if (type === 'restaurant') return Utensils;
    return Layers;
  };

  // Categories flagged hiddenInPOS stay out of the cashier interface entirely —
  // their items remain reachable via the type filters (FOOD & KITCHEN etc.) and
  // ALL ITEMS, while the category itself is managed in the Super Admin panel only.
  const activeCategories = categories.filter(c => c.isActive && !c.hiddenInPOS);
  const occupiedRoomsCount = rooms.filter(r => r.status === 'occupied').length;

  return (
    <aside
      id="pos-category-sidebar"
      className="w-20 md:w-24 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex flex-col items-center py-3 px-2 gap-2.5 overflow-y-auto shrink-0 select-none shadow-xs"
    >
      {/* ALL Button */}
      <button
        type="button"
        id="cat-sidebar-all"
        onClick={() => setSelectedCategory('all')}
        className={`w-16 h-15 md:w-18 md:h-16 flex flex-col items-center justify-center rounded-xl transition-all cursor-pointer ${
          selectedCategory === 'all'
            ? 'bg-blue-600 text-white shadow-md ring-2 ring-blue-500/30'
            : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700'
        }`}
      >
        <Sparkles className="w-4 h-4 mb-0.5" />
        <span className="text-[10px] font-extrabold uppercase tracking-tight text-center leading-none">
          ALL
        </span>
      </button>

      {/* Dedicated HOTEL ROOMS button */}
      <button
        type="button"
        id="cat-sidebar-rooms"
        onClick={() => setSelectedCategory('rooms')}
        className={`w-16 h-15 md:w-18 md:h-16 flex flex-col items-center justify-center rounded-xl transition-all cursor-pointer relative ${
          selectedCategory === 'rooms'
            ? 'bg-emerald-600 text-white shadow-md ring-2 ring-emerald-500/30'
            : 'bg-emerald-950/20 text-emerald-600 dark:text-emerald-400 border border-emerald-800/40 hover:bg-emerald-950/40'
        }`}
      >
        <BedDouble className="w-4 h-4 mb-0.5 shrink-0" />
        <span className="text-[10px] font-black uppercase tracking-tight text-center leading-none">
          ROOMS
        </span>
        {occupiedRoomsCount > 0 && (
          <span className="absolute -top-1 -right-1 px-1.5 py-0.2 bg-rose-500 text-white text-[9px] font-bold rounded-full border border-slate-900">
            {occupiedRoomsCount}
          </span>
        )}
      </button>

      {/* Specific Categories */}
      {activeCategories.map(cat => {
        const isSelected = selectedCategory === cat.id;
        const Icon = getCategoryIcon(cat.name, cat.type);

        return (
          <button
            key={cat.id}
            id={`cat-sidebar-${cat.id}`}
            type="button"
            onClick={() => setSelectedCategory(cat.id)}
            className={`w-16 h-15 md:w-18 md:h-16 flex flex-col items-center justify-center rounded-xl p-1 transition-all cursor-pointer ${
              isSelected
                ? 'bg-blue-600 text-white shadow-md ring-2 ring-blue-500/30'
                : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700'
            }`}
          >
            <Icon className="w-4 h-4 mb-0.5 shrink-0" />
            <span className="text-[10px] font-bold uppercase tracking-tight text-center leading-tight line-clamp-2">
              {cat.name}
            </span>
          </button>
        );
      })}
    </aside>
  );
};
