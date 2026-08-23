import React, { useState, useEffect } from 'react';
import { fetchApi } from '../../lib/api.ts';
import { Category, Company, CategoryType } from '../../types.ts';
import { Plus, Edit2, Trash2, Layers, Building2, Check, X, AlertCircle } from 'lucide-react';

export const CategoryCompanyManagement: React.FC = () => {
  const [categories, setCategories] = useState<Category[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Category Modal State
  const [isCatModalOpen, setIsCatModalOpen] = useState<boolean>(false);
  const [editingCat, setEditingCat] = useState<Category | null>(null);
  const [catName, setCatName] = useState<string>('');
  const [catType, setCatType] = useState<CategoryType>('bar');
  const [catDescription, setCatDescription] = useState<string>('');

  // Company Modal State
  const [isCompModalOpen, setIsCompModalOpen] = useState<boolean>(false);
  const [editingComp, setEditingComp] = useState<Company | null>(null);
  const [compName, setCompName] = useState<string>('');
  const [compContact, setCompContact] = useState<string>('');
  const [compDescription, setCompDescription] = useState<string>('');

  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const loadData = async () => {
    try {
      setIsLoading(true);
      const [cats, comps] = await Promise.all([
        fetchApi<Category[]>('/categories'),
        fetchApi<Company[]>('/companies'),
      ]);
      setCategories(Array.isArray(cats) ? cats : []);
      setCompanies(Array.isArray(comps) ? comps : []);
    } catch (err) {
      console.error('Failed to load categories & companies:', err);
      setCategories([]);
      setCompanies([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Category handlers
  const handleOpenCatModal = (cat?: Category) => {
    if (cat) {
      setEditingCat(cat);
      setCatName(cat.name);
      setCatType(cat.type);
      setCatDescription(cat.description || '');
    } else {
      setEditingCat(null);
      setCatName('');
      setCatType('bar');
      setCatDescription('');
    }
    setErrorMsg(null);
    setIsCatModalOpen(true);
  };

  const handleSaveCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!catName.trim()) return;

    try {
      if (editingCat) {
        await fetchApi(`/categories/${editingCat.id}`, {
          method: 'PUT',
          body: JSON.stringify({ name: catName, type: catType, description: catDescription }),
        });
      } else {
        await fetchApi('/categories', {
          method: 'POST',
          body: JSON.stringify({ name: catName, type: catType, description: catDescription }),
        });
      }
      setIsCatModalOpen(false);
      await loadData();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to save category');
    }
  };

  const handleDeleteCategory = async (id: string) => {
    if (!confirm('Are you sure you want to delete this category?')) return;
    try {
      await fetchApi(`/categories/${id}`, { method: 'DELETE' });
      await loadData();
    } catch (err: any) {
      alert(err.message || 'Failed to delete category');
    }
  };

  // Company handlers
  const handleOpenCompModal = (comp?: Company) => {
    if (comp) {
      setEditingComp(comp);
      setCompName(comp.name);
      setCompContact(comp.contactPerson || '');
      setCompDescription(comp.description || '');
    } else {
      setEditingComp(null);
      setCompName('');
      setCompContact('');
      setCompDescription('');
    }
    setErrorMsg(null);
    setIsCompModalOpen(true);
  };

  const handleSaveCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!compName.trim()) return;

    try {
      if (editingComp) {
        await fetchApi(`/companies/${editingComp.id}`, {
          method: 'PUT',
          body: JSON.stringify({ name: compName, contactPerson: compContact, description: compDescription }),
        });
      } else {
        await fetchApi('/companies', {
          method: 'POST',
          body: JSON.stringify({ name: compName, contactPerson: compContact, description: compDescription }),
        });
      }
      setIsCompModalOpen(false);
      await loadData();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to save company');
    }
  };

  const handleDeleteCompany = async (id: string) => {
    if (!confirm('Are you sure you want to delete this brand/company?')) return;
    try {
      await fetchApi(`/companies/${id}`, { method: 'DELETE' });
      await loadData();
    } catch (err: any) {
      alert(err.message || 'Failed to delete company');
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
          Categories & Brands Management
        </h1>
        <p className="text-xs text-slate-500 mt-0.5">
          Organize bar spirits, kitchen food departments, and beverage distilleries / suppliers
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Categories Section */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-5 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-400 flex items-center justify-center">
                  <Layers className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-900 dark:text-white">Product Categories</h2>
                  <p className="text-[11px] text-slate-500">{categories.length} Categories configured</p>
                </div>
              </div>

              <button
                onClick={() => handleOpenCatModal()}
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center gap-1 shadow-xs transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Category
              </button>
            </div>

            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {categories.map(cat => (
                <div key={cat.id} className="py-3 flex items-center justify-between">
                  <div>
                    <div className="font-bold text-xs text-slate-900 dark:text-white flex items-center gap-2">
                      <span>{cat.name}</span>
                      <span className="px-2 py-0.5 rounded text-[10px] font-semibold uppercase bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                        {cat.type}
                      </span>
                    </div>
                    {cat.description && (
                      <p className="text-[11px] text-slate-400 mt-0.5">{cat.description}</p>
                    )}
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleOpenCatModal(cat)}
                      className="p-1.5 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/40 rounded-lg"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDeleteCategory(cat.id)}
                      className="p-1.5 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Brands / Distilleries Section */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-5 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-600 dark:bg-amber-950/50 dark:text-amber-400 flex items-center justify-center">
                  <Building2 className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-900 dark:text-white">Brands & Distilleries</h2>
                  <p className="text-[11px] text-slate-500">{companies.length} Brands / Companies listed</p>
                </div>
              </div>

              <button
                onClick={() => handleOpenCompModal()}
                className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold flex items-center gap-1 shadow-xs transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Brand
              </button>
            </div>

            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {companies.map(comp => (
                <div key={comp.id} className="py-3 flex items-center justify-between">
                  <div>
                    <div className="font-bold text-xs text-slate-900 dark:text-white">
                      {comp.name}
                    </div>
                    {comp.contactPerson && (
                      <p className="text-[11px] text-slate-500 mt-0.5">Contact: {comp.contactPerson}</p>
                    )}
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleOpenCompModal(comp)}
                      className="p-1.5 text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/40 rounded-lg"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDeleteCompany(comp.id)}
                      className="p-1.5 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Category Modal */}
      {isCatModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 backdrop-blur-xs p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl max-w-md w-full p-5 space-y-4">
            <h3 className="font-bold text-base text-slate-900 dark:text-white">
              {editingCat ? 'Edit Category' : 'Create New Category'}
            </h3>
            {errorMsg && <div className="text-xs text-rose-600">{errorMsg}</div>}
            <form onSubmit={handleSaveCategory} className="space-y-3">
              <div>
                <label className="text-xs font-bold text-slate-500 block mb-1">Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Arrack, Beer, Main Course"
                  value={catName}
                  onChange={e => setCatName(e.target.value)}
                  className="w-full text-xs font-semibold px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-500 block mb-1">Department Type</label>
                <select
                  value={catType}
                  onChange={e => setCatType(e.target.value as CategoryType)}
                  className="w-full text-xs font-semibold px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
                >
                  <option value="bar">Bar Spirits & Liquors</option>
                  <option value="restaurant">Restaurant Food & Kitchen</option>
                  <option value="service">Service & Room</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-500 block mb-1">Description (Optional)</label>
                <input
                  type="text"
                  value={catDescription}
                  onChange={e => setCatDescription(e.target.value)}
                  className="w-full text-xs px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsCatModalOpen(false)}
                  className="px-3 py-1.5 text-xs text-slate-600"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-blue-600 text-white rounded-xl text-xs font-bold"
                >
                  Save Category
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Company Modal */}
      {isCompModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 backdrop-blur-xs p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl max-w-md w-full p-5 space-y-4">
            <h3 className="font-bold text-base text-slate-900 dark:text-white">
              {editingComp ? 'Edit Brand / Company' : 'Create Brand / Company'}
            </h3>
            {errorMsg && <div className="text-xs text-rose-600">{errorMsg}</div>}
            <form onSubmit={handleSaveCompany} className="space-y-3">
              <div>
                <label className="text-xs font-bold text-slate-500 block mb-1">Company / Brand Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Rockland Distilleries, Lion Brewery"
                  value={compName}
                  onChange={e => setCompName(e.target.value)}
                  className="w-full text-xs font-semibold px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-500 block mb-1">Contact Person / Supplier</label>
                <input
                  type="text"
                  placeholder="e.g. Sales Agent John (0771234567)"
                  value={compContact}
                  onChange={e => setCompContact(e.target.value)}
                  className="w-full text-xs px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsCompModalOpen(false)}
                  className="px-3 py-1.5 text-xs text-slate-600"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-amber-600 text-white rounded-xl text-xs font-bold"
                >
                  Save Brand
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
