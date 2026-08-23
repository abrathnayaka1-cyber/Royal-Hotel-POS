import React from 'react';
import { usePOS } from '../../context/POSContext.tsx';
import { Search, Wine, Utensils, Beer, Sparkles, Filter, X, GlassWater, BedDouble } from 'lucide-react';

export const CategoryTabs: React.FC = () => {
  const {
    categories,
    companies,
    selectedCategory,
    setSelectedCategory,
    searchQuery,
    setSearchQuery,
    selectedCompany,
    setSelectedCompany,
    rooms,
  } = usePOS();

  const occupiedRoomsCount = rooms.filter(r => r.status === 'occupied').length;

  // Preset quick broad groups
  const quickGroups = [
    { id: 'all', label: 'ALL ITEMS', icon: Sparkles },
    { id: 'rooms', label: `HOTEL ROOMS (${rooms.length})`, icon: BedDouble, highlight: true },
    { id: 'type:bar', label: 'BAR SPIRITS', icon: Wine },
    { id: 'type:restaurant', label: 'FOOD & KITCHEN', icon: Utensils },
    { id: 'cat-3', label: 'BEERS', icon: Beer },
    { id: 'type:service', label: 'SOFT DRINKS', icon: GlassWater },
  ];

  return (
    <div className="flex flex-col gap-2.5">
      {/* Search & Brand Filter Bar */}
      <div className="flex flex-col sm:flex-row gap-2 items-center justify-between">
        {/* Live Search Input */}
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            id="pos-search-input"
            type="text"
            placeholder="Search brand, liquor, dish, barcode..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-9.5 pr-8 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-blue-500 shadow-2xs"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 rounded-full"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Brand / Company Dropdown Filter */}
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">
            <Filter className="w-3.5 h-3.5 text-blue-500" />
            <span>Brand:</span>
          </div>
          <select
            id="pos-company-filter"
            value={selectedCompany}
            onChange={e => setSelectedCompany(e.target.value)}
            className="w-full sm:w-52 px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-800 dark:text-slate-200 focus:outline-hidden focus:ring-2 focus:ring-blue-500 cursor-pointer shadow-2xs"
          >
            <option value="all">All Brands / Companies</option>
            {companies
              .filter(c => c.isActive)
              .map(comp => (
                <option key={comp.id} value={comp.id}>
                  {comp.name}
                </option>
              ))}
          </select>
        </div>
      </div>

      {/* Quick Grouping Pill Filters */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
        {quickGroups.map(group => {
          const isSelected = selectedCategory === group.id;
          const Icon = group.icon;
          return (
            <button
              key={group.id}
              id={`quick-filter-${group.id.replace(':', '-')}`}
              type="button"
              onClick={() => setSelectedCategory(group.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs ${
                isSelected
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:border-blue-400 dark:hover:border-slate-600'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{group.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

