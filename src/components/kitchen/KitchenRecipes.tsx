import React, { useState, useEffect } from 'react';
import { fetchApi } from '../../lib/api.ts';
import { usePOS } from '../../context/POSContext.tsx';
import { KitchenRecipe, KitchenRecipeItem, KitchenIngredient, KitchenMenuItem } from '../../types.ts';
import {
  BookOpen,
  Plus,
  Edit2,
  Archive,
  ArchiveRestore,
  AlertCircle,
  RefreshCw,
  CheckCircle2,
  X,
  Trash2,
  History,
  ChefHat,
} from 'lucide-react';

/**
 * RECIPES & PRODUCTION — link POS food menu items to ingredient quantities.
 * When a recipe-linked item sells through the POS, ingredients are deducted
 * automatically. Recipe edits keep previous versions in history.
 */
export const KitchenRecipes: React.FC = () => {
  const { settings } = usePOS();
  const currencySymbol = settings?.currencySymbol || 'Rs.';

  const [recipes, setRecipes] = useState<KitchenRecipe[]>([]);
  const [menuItems, setMenuItems] = useState<KitchenMenuItem[]>([]);
  const [ingredients, setIngredients] = useState<KitchenIngredient[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [showArchived, setShowArchived] = useState<boolean>(false);

  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [editing, setEditing] = useState<KitchenRecipe | null>(null);
  const [formVariant, setFormVariant] = useState<string>('');
  const [formServings, setFormServings] = useState<string>('1');
  const [formLines, setFormLines] = useState<KitchenRecipeItem[]>([]);
  const [historyRecipe, setHistoryRecipe] = useState<KitchenRecipe | null>(null);

  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const load = async () => {
    try {
      setIsLoading(true);
      const [recs, menu, ings] = await Promise.all([
        fetchApi<KitchenRecipe[]>(`/kitchen/recipes${showArchived ? '?archived=true' : ''}`),
        fetchApi<KitchenMenuItem[]>('/kitchen/menu-items'),
        fetchApi<KitchenIngredient[]>('/kitchen/ingredients'),
      ]);
      setRecipes(Array.isArray(recs) ? recs : []);
      setMenuItems(Array.isArray(menu) ? menu : []);
      setIngredients(Array.isArray(ings) ? ings : []);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to load recipes.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [showArchived]);

  const openCreate = () => {
    setEditing(null);
    const firstFree = menuItems.find(m => !m.recipeId);
    setFormVariant(firstFree ? firstFree.variantId : '');
    setFormServings('1');
    setFormLines([]);
    setErrorMsg(null); setSuccessMsg(null);
    setIsModalOpen(true);
  };

  const openEdit = (r: KitchenRecipe) => {
    setEditing(r);
    setFormVariant(r.variantId);
    setFormServings(String(r.servings));
    setFormLines(r.items.map(i => ({ ...i })));
    setErrorMsg(null); setSuccessMsg(null);
    setIsModalOpen(true);
  };

  const addLine = () => {
    const first = ingredients[0];
    if (!first) return;
    setFormLines(prev => [...prev, { ingredientId: first.id, ingredientName: first.name, unit: first.unit, quantity: 0 }]);
  };

  const updateLine = (idx: number, patch: Partial<KitchenRecipeItem>) => {
    setFormLines(prev => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  };

  const removeLine = (idx: number) => {
    setFormLines(prev => prev.filter((_, i) => i !== idx));
  };

  const previewCost = (): number => {
    const servings = Number(formServings) > 0 ? Number(formServings) : 1;
    return formLines.reduce((sum, line) => {
      const ing = ingredients.find(i => i.id === line.ingredientId);
      return sum + (line.quantity / servings) * (ing ? ing.costPerUnit : 0);
    }, 0);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    if (!formVariant) { setErrorMsg('Select the menu item this recipe belongs to.'); return; }
    if (formLines.length === 0) { setErrorMsg('Add at least one ingredient line.'); return; }
    for (const line of formLines) {
      if (!Number.isFinite(line.quantity) || line.quantity <= 0) {
        setErrorMsg(`Quantity for ${line.ingredientName} must be positive.`);
        return;
      }
    }

    try {
      const body = JSON.stringify({
        variantId: formVariant,
        servings: Number(formServings) || 1,
        items: formLines,
      });
      if (editing) {
        await fetchApi(`/kitchen/recipes/${editing.id}`, { method: 'PUT', body });
        setSuccessMsg(`Recipe for ${editing.productName} updated — previous version kept in history.`);
      } else {
        await fetchApi('/kitchen/recipes', { method: 'POST', body });
        setSuccessMsg('Recipe created. POS sales of this item now auto-deduct ingredients.');
      }
      setIsModalOpen(false);
      setTimeout(() => setSuccessMsg(null), 5000);
      await load();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to save recipe.');
    }
  };

  const toggleArchive = async (r: KitchenRecipe) => {
    try {
      setErrorMsg(null);
      await fetchApi(`/kitchen/recipes/${r.id}/archive`, { method: 'PATCH' });
      setSuccessMsg(r.isActive
        ? `Recipe for ${r.productName} archived — sales will NOT deduct ingredients until re-activated.`
        : `Recipe for ${r.productName} re-activated.`);
      setTimeout(() => setSuccessMsg(null), 5000);
      await load();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to update recipe.');
    }
  };

  const selectedMenuItem = menuItems.find(m => m.variantId === formVariant);

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-2.5">
            <BookOpen className="w-6 h-6 text-amber-500" />
            Recipes &amp; Production
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-bold">
              {recipes.filter(r => r.isActive).length} Active
            </span>
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Ingredient quantities per portion — sold items deduct ingredients automatically from the kitchen store
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowArchived(s => !s)}
            className={`px-3 py-2.5 rounded-xl text-xs font-bold flex items-center gap-1.5 border transition-colors cursor-pointer ${
              showArchived
                ? 'bg-slate-700 text-white border-slate-600'
                : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700'
            }`}
          >
            {showArchived ? <ArchiveRestore className="w-4 h-4" /> : <Archive className="w-4 h-4" />}
            {showArchived ? 'Hide Archived' : 'Show Archived'}
          </button>
          <button
            onClick={load}
            className="p-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-xl text-slate-600 dark:text-slate-300 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
            title="Refresh"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={openCreate}
            className="px-4 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-md shadow-amber-600/20 transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
            New Recipe
          </button>
        </div>
      </div>

      {successMsg && (
        <div className="p-3 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 rounded-xl text-xs font-semibold flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}
      {errorMsg && !isModalOpen && (
        <div className="p-3 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-300 rounded-xl text-xs font-semibold flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Recipe cards */}
      {isLoading && <div className="py-16 text-center text-sm font-bold text-slate-400">Loading recipes…</div>}
      {!isLoading && recipes.length === 0 && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-10 text-center">
          <ChefHat className="w-10 h-10 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
          <h3 className="font-black text-slate-800 dark:text-slate-200">No recipes yet</h3>
          <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
            Create a recipe for a food menu item (e.g. Chicken Fried Rice — Regular Portion). Every POS sale will then
            automatically deduct the ingredients from the kitchen store.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {recipes.map(r => (
          <div key={r.id} className={`bg-white dark:bg-slate-900 border rounded-2xl shadow-xs overflow-hidden ${r.isActive ? 'border-slate-200/80 dark:border-slate-800' : 'border-slate-200/60 dark:border-slate-800 opacity-75'}`}>
            <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-sm font-black text-slate-900 dark:text-white truncate">{r.productName}</h3>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300">
                    {r.variantSize}
                  </span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                    v{r.version}
                  </span>
                  {!r.isActive && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300">
                      Archived
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Cost / portion: <span className="font-black text-amber-600 dark:text-amber-400">{currencySymbol} {(r.recipeCostPerServing || 0).toLocaleString()}</span>
                  {' · '}
                  {r.servings} portion{(r.servings > 1 ? 's' : '')} per batch
                </p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {r.history.length > 0 && (
                  <button
                    onClick={() => setHistoryRecipe(r)}
                    className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 rounded-lg transition-colors cursor-pointer"
                    title={`${r.history.length} previous version(s)`}
                  >
                    <History className="w-4 h-4" />
                  </button>
                )}
                <button
                  onClick={() => openEdit(r)}
                  className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/40 rounded-lg transition-colors cursor-pointer"
                  title="Edit recipe"
                >
                  <Edit2 className="w-4 h-4" />
                </button>
                <button
                  onClick={() => toggleArchive(r)}
                  className={`p-1.5 rounded-lg transition-colors cursor-pointer ${r.isActive ? 'text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40' : 'text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40'}`}
                  title={r.isActive ? 'Archive recipe' : 'Re-activate recipe'}
                >
                  {r.isActive ? <Archive className="w-4 h-4" /> : <ArchiveRestore className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div className="p-4">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1.5">
                {r.items.map(item => (
                  <div key={item.ingredientId} className="flex items-center justify-between text-[11px] border-b border-dashed border-slate-100 dark:border-slate-800 pb-1">
                    <span className="text-slate-600 dark:text-slate-300 truncate pr-2">{item.ingredientName}</span>
                    <span className="font-mono font-bold text-slate-800 dark:text-slate-100 whitespace-nowrap">
                      {(item.quantity / (r.servings > 0 ? r.servings : 1)).toLocaleString()} {item.unit}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Create / Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl max-w-2xl w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-amber-500/10 text-amber-600 flex items-center justify-center">
                  <BookOpen className="w-4.5 h-4.5" />
                </div>
                <div>
                  <h3 className="font-black text-base text-slate-900 dark:text-white">
                    {editing ? `Edit Recipe — ${editing.productName}` : 'New Recipe'}
                  </h3>
                  <p className="text-xs text-slate-500">Ingredient quantities deducted per portion on every POS sale</p>
                </div>
              </div>
              <button onClick={() => setIsModalOpen(false)} className="p-1 text-slate-400 hover:text-slate-600 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            {errorMsg && (
              <div className="p-2.5 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 text-rose-700 dark:text-rose-300 rounded-xl text-xs flex items-center gap-1.5 font-semibold">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            <form onSubmit={handleSave} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <div className="sm:col-span-2">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">Menu Item (POS food) *</label>
                  <select
                    value={formVariant}
                    onChange={e => setFormVariant(e.target.value)}
                    disabled={Boolean(editing)}
                    className="w-full text-xs font-semibold px-3 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl cursor-pointer disabled:opacity-60"
                  >
                    <option value="">Select menu item &amp; size…</option>
                    {menuItems
                      .filter(m => !m.recipeId || (editing && m.variantId === editing.variantId))
                      .map(m => (
                        <option key={m.variantId} value={m.variantId}>
                          {m.productName} — {m.variantSize} ({currencySymbol} {m.sellingPrice.toLocaleString()})
                        </option>
                      ))}
                  </select>
                  {selectedMenuItem && (
                    <p className="text-[10px] text-slate-500 mt-1">
                      Selling price: {currencySymbol} {selectedMenuItem.sellingPrice.toLocaleString()}
                      {selectedMenuItem.recipeCost !== null && ` · current recipe cost: ${currencySymbol} ${selectedMenuItem.recipeCost.toLocaleString()}`}
                    </p>
                  )}
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">Portions / Batch *</label>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={formServings}
                    onChange={e => setFormServings(e.target.value)}
                    className="w-full text-xs font-semibold px-3 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-mono"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    Ingredients per batch *
                  </label>
                  <button
                    type="button"
                    onClick={addLine}
                    className="px-2.5 py-1 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-lg text-[11px] font-bold flex items-center gap-1 transition-colors cursor-pointer"
                  >
                    <Plus className="w-3 h-3" />
                    Add Line
                  </button>
                </div>
                <div className="space-y-2">
                  {formLines.length === 0 && (
                    <p className="text-[11px] text-slate-400 text-center py-4 border border-dashed border-slate-200 dark:border-slate-700 rounded-xl">
                      e.g. Rice 250g · Chicken 80g · Egg 1pcs · Oil 15ml
                    </p>
                  )}
                  {formLines.map((line, idx) => {
                    const ing = ingredients.find(i => i.id === line.ingredientId);
                    return (
                      <div key={idx} className="flex items-center gap-2">
                        <select
                          value={line.ingredientId}
                          onChange={e => {
                            const newIng = ingredients.find(i => i.id === e.target.value);
                            updateLine(idx, newIng ? { ingredientId: newIng.id, ingredientName: newIng.name, unit: newIng.unit } : {});
                          }}
                          className="flex-1 text-xs font-semibold px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl cursor-pointer"
                        >
                          {ingredients.map(i => <option key={i.id} value={i.id}>{i.name} ({i.unit})</option>)}
                        </select>
                        <input
                          type="number"
                          step="0.001"
                          min="0"
                          placeholder="Qty"
                          value={line.quantity || ''}
                          onChange={e => updateLine(idx, { quantity: Number(e.target.value) })}
                          className="w-24 text-xs font-semibold px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-mono"
                        />
                        <span className="text-[11px] font-bold text-slate-500 w-8">{ing?.unit || line.unit}</span>
                        <button
                          type="button"
                          onClick={() => removeLine(idx)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>
                {formLines.length > 0 && (
                  <p className="text-[11px] text-slate-500 mt-2">
                    Recipe cost per portion:{' '}
                    <span className="font-black text-amber-600 dark:text-amber-400">{currencySymbol} {previewCost().toFixed(2)}</span>
                  </p>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold shadow-md shadow-amber-600/20 transition-all cursor-pointer"
                >
                  {editing ? 'Save New Version' : 'Create Recipe'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* History Modal */}
      {historyRecipe && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl max-w-lg w-full p-6 space-y-4 max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-black text-base text-slate-900 dark:text-white">Recipe History</h3>
                <p className="text-xs text-slate-500">{historyRecipe.productName} ({historyRecipe.variantSize})</p>
              </div>
              <button onClick={() => setHistoryRecipe(null)} className="p-1 text-slate-400 hover:text-slate-600 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>
            {[...historyRecipe.history].reverse().map(hv => (
              <div key={hv.version} className="border border-slate-200 dark:border-slate-800 rounded-2xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                    Version {hv.version}
                  </span>
                  <span className="text-[10px] text-slate-400">
                    {new Date(hv.savedAt).toLocaleString()} · {hv.savedByName}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                  {hv.items.map(item => (
                    <div key={item.ingredientId} className="flex justify-between text-[11px]">
                      <span className="text-slate-600 dark:text-slate-300 truncate pr-2">{item.ingredientName}</span>
                      <span className="font-mono font-bold">{item.quantity} {item.unit}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
