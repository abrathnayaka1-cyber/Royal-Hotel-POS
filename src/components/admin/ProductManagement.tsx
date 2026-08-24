import React, { useState, useEffect } from 'react';
import { fetchApi } from '../../lib/api.ts';
import { Product, ProductVariant, Category, Company, SystemSettings } from '../../types.ts';
import {
  Plus,
  Edit2,
  Trash2,
  Search,
  Layers,
  Check,
  X,
  AlertCircle,
  Wine,
  Utensils,
  Archive,
  RefreshCw,
  PlusCircle,
  Tag
} from 'lucide-react';

export const ProductManagement: React.FC<{ settings: SystemSettings | null }> = ({ settings }) => {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [search, setSearch] = useState<string>('');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [filterCompany, setFilterCompany] = useState<string>('all');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Form State
  const [formName, setFormName] = useState<string>('');
  const [formCategoryId, setFormCategoryId] = useState<string>('');
  const [formCompanyId, setFormCompanyId] = useState<string>('');
  const [formDescription, setFormDescription] = useState<string>('');
  const [formIsKitchen, setFormIsKitchen] = useState<boolean>(false);
  const [formServesShots, setFormServesShots] = useState<boolean>(false);
  const [formVariants, setFormVariants] = useState<
    { id?: string; size: string; sku: string; barcode?: string; costPrice: number; sellingPrice: number; stock: number; minStockLevel: number; isActive: boolean; isShot?: boolean; shotVolumeMl?: number }[]
  >([]);

  const currencySymbol = settings?.currencySymbol || 'Rs.';

  const loadData = async () => {
    try {
      setIsLoading(true);
      const [prods, cats, comps] = await Promise.all([
        fetchApi<Product[]>('/products'),
        fetchApi<Category[]>('/categories'),
        fetchApi<Company[]>('/companies'),
      ]);
      setProducts(Array.isArray(prods) ? prods : []);
      setCategories(Array.isArray(cats) ? cats : []);
      setCompanies(Array.isArray(comps) ? comps : []);
    } catch (err) {
      console.error('Failed to load products:', err);
      setProducts([]);
      setCategories([]);
      setCompanies([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const openCreateModal = () => {
    setEditingProduct(null);
    setFormName('');
    setFormCategoryId(categories[0]?.id || '');
    setFormCompanyId(companies[0]?.id || '');
    setFormDescription('');
    setFormIsKitchen(false);
    setFormServesShots(false);
    // Default standard bottle sizes for quick entry
    setFormVariants([
      { size: '750ml Bottle', sku: '', costPrice: 3000, sellingPrice: 3800, stock: 20, minStockLevel: 5, isActive: true },
      { size: '375ml Half', sku: '', costPrice: 1500, sellingPrice: 1950, stock: 30, minStockLevel: 5, isActive: true },
      { size: '180ml Quarter', sku: '', costPrice: 750, sellingPrice: 1000, stock: 40, minStockLevel: 8, isActive: true },
    ]);
    setErrorMsg(null);
    setIsModalOpen(true);
  };

  const openEditModal = (product: Product) => {
    setEditingProduct(product);
    setFormName(product.name);
    setFormCategoryId(product.categoryId);
    setFormCompanyId(product.companyId || '');
    setFormDescription(product.description || '');
    setFormIsKitchen(product.isKitchenItem);
    setFormServesShots(Boolean(product.servesShots));
    setFormVariants(
      product.variants.map(v => ({
        id: v.id,
        size: v.size,
        sku: v.sku,
        barcode: v.barcode || '',
        costPrice: v.costPrice,
        sellingPrice: v.sellingPrice,
        stock: v.isShot ? 0 : v.stock,
        minStockLevel: v.minStockLevel,
        isActive: v.isActive,
        isShot: v.isShot || false,
        shotVolumeMl: v.shotVolumeMl,
      }))
    );
    setErrorMsg(null);
    setIsModalOpen(true);
  };

  /** Toggle "Serves Shots": adds the standard 100/50/25ml shot rows or removes them. */
  const handleToggleServesShots = (enabled: boolean) => {
    setFormServesShots(enabled);
    if (enabled) {
      setFormVariants(prev => {
        if (prev.some(v => v.isShot)) return prev;
        return [
          ...prev,
          { size: '100ml Shot', sku: '', costPrice: 0, sellingPrice: 620, stock: 0, minStockLevel: 0, isActive: true, isShot: true, shotVolumeMl: 100 },
          { size: '50ml Shot', sku: '', costPrice: 0, sellingPrice: 330, stock: 0, minStockLevel: 0, isActive: true, isShot: true, shotVolumeMl: 50 },
          { size: '25ml Shot', sku: '', costPrice: 0, sellingPrice: 180, stock: 0, minStockLevel: 0, isActive: true, isShot: true, shotVolumeMl: 25 },
        ];
      });
    } else {
      setFormVariants(prev => prev.filter(v => !v.isShot));
    }
  };

  const addVariantRow = () => {
    setFormVariants([
      ...formVariants,
      { size: 'New Size', sku: '', costPrice: 0, sellingPrice: 0, stock: 10, minStockLevel: 5, isActive: true },
    ]);
  };

  const removeVariantRow = (index: number) => {
    if (formVariants.length <= 1) {
      setErrorMsg('Product must have at least one size/variant.');
      return;
    }
    setFormVariants(formVariants.filter((_, i) => i !== index));
  };

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) {
      setErrorMsg('Product name is required.');
      return;
    }
    if (!formCategoryId) {
      setErrorMsg('Please select a valid product category.');
      return;
    }
    if (formVariants.length === 0) {
      setErrorMsg('Please define at least one size/variant.');
      return;
    }
    if (formServesShots) {
      const hasBottle = formVariants.some(v => !v.isShot && /750\s*ml/i.test(v.size));
      if (!hasBottle) {
        setErrorMsg('Serves Shots requires a 750ml Bottle size — shots are deducted from the 750ml bottle total stock.');
        return;
      }
      if (!formVariants.some(v => v.isShot)) {
        setErrorMsg('Serves Shots is enabled but no shot sizes (100ml / 50ml / 25ml) are defined.');
        return;
      }
    }

    try {
      setErrorMsg(null);
      const payload = {
        name: formName.trim(),
        categoryId: formCategoryId,
        companyId: formCompanyId || undefined,
        description: formDescription.trim(),
        isKitchenItem: formIsKitchen,
        servesShots: formServesShots,
        variants: formVariants.map(v => ({
          ...v,
          costPrice: Number(v.costPrice || 0),
          sellingPrice: Number(v.sellingPrice || 0),
          stock: v.isShot ? 0 : Number(v.stock || 0),
          minStockLevel: v.isShot ? 0 : Number(v.minStockLevel || 5),
          isShot: formServesShots && Boolean(v.isShot),
          shotVolumeMl: formServesShots && v.isShot ? Number(v.shotVolumeMl || 0) : undefined,
        })),
      };

      if (editingProduct) {
        await fetchApi(`/products/${editingProduct.id}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
      } else {
        await fetchApi('/products', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
      }

      setIsModalOpen(false);
      await loadData();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to save product.');
    }
  };

  const handleArchiveProduct = async (product: Product) => {
    if (
      !confirm(
        `Are you sure you want to archive "${product.name}"? It will be safely removed from POS while preserving all past sales records.`
      )
    ) {
      return;
    }

    try {
      await fetchApi(`/products/${product.id}`, { method: 'DELETE' });
      await loadData();
    } catch (err: any) {
      alert(err.message || 'Failed to archive product.');
    }
  };

  const filteredProducts = products.filter(p => {
    if (p.isArchived) return false;
    if (filterCategory !== 'all' && p.categoryId !== filterCategory) return false;
    if (filterCompany !== 'all' && p.companyId !== filterCompany) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      const matchName = p.name.toLowerCase().includes(q);
      const matchVariant = p.variants.some(v => v.size.toLowerCase().includes(q) || v.sku.toLowerCase().includes(q));
      if (!matchName && !matchVariant) return false;
    }
    return true;
  });

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
            Bar & Restaurant Products & Variants
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Configure multi-size bottle variants (750ml, 375ml, 180ml, 100ml, 50ml, 25ml, Full, Regular), pricing and stock
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={loadData}
            className="p-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 rounded-xl text-slate-600 dark:text-slate-300 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
          <button
            id="add-product-btn"
            onClick={openCreateModal}
            className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-md shadow-blue-600/20 transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
            Add New Product & Variants
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl shadow-xs flex flex-col sm:flex-row gap-3 items-center justify-between">
        {/* Search */}
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search by name, size, SKU..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-medium text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Categories & Brand Dropdowns */}
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <select
            value={filterCategory}
            onChange={e => setFilterCategory(e.target.value)}
            className="px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-medium text-slate-800 dark:text-slate-200 cursor-pointer"
          >
            <option value="all">All Categories</option>
            {categories.map(c => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.type.toUpperCase()})
              </option>
            ))}
          </select>

          <select
            value={filterCompany}
            onChange={e => setFilterCompany(e.target.value)}
            className="px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-medium text-slate-800 dark:text-slate-200 cursor-pointer"
          >
            <option value="all">All Brands / Distilleries</option>
            {companies.map(c => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Products Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 uppercase font-bold">
                <th className="py-3 px-4">Product Name & Brand</th>
                <th className="py-3 px-4">Category</th>
                <th className="py-3 px-4">Sizes / Variants & Stock</th>
                <th className="py-3 px-4">Price Range</th>
                <th className="py-3 px-4 text-center">Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredProducts.map(product => {
                const category = categories.find(c => c.id === product.categoryId);
                const company = companies.find(c => c.id === product.companyId);
                const activeVariants = product.variants.filter(v => v.isActive);
                const prices = activeVariants.map(v => v.sellingPrice);
                const minPrice = prices.length > 0 ? Math.min(...prices) : 0;
                const maxPrice = prices.length > 0 ? Math.max(...prices) : 0;

                return (
                  <tr key={product.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                    <td className="py-3.5 px-4">
                      <div className="font-bold text-sm text-slate-900 dark:text-white">
                        {product.name}
                      </div>
                      <div className="text-[11px] text-slate-500 flex items-center gap-1.5 mt-0.5">
                        <span>{company?.name || 'In-House Brand'}</span>
                        {product.isKitchenItem && (
                          <span className="px-1.5 py-0.2 bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300 rounded font-semibold text-[10px]">
                            Kitchen KOT
                          </span>
                        )}
                        {product.servesShots && (
                          <span className="px-1.5 py-0.2 bg-purple-50 text-purple-700 dark:bg-purple-950 dark:text-purple-300 rounded font-semibold text-[10px]" title="Shots are deducted from the 750ml Bottle total stock">
                            🥃 Shots from 750ml
                          </span>
                        )}
                        {product.servesShots && (product.openBottleUsedMl || 0) > 0 && (
                          <span className="px-1.5 py-0.2 bg-cyan-50 text-cyan-700 dark:bg-cyan-950 dark:text-cyan-300 rounded font-semibold text-[10px]" title="The currently open 750ml bottle">
                            Open bottle: {product.openBottleUsedMl}ml used / {750 - (product.openBottleUsedMl || 0)}ml left
                          </span>
                        )}
                      </div>
                    </td>

                    <td className="py-3.5 px-4">
                      <span className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                        {category?.name || 'Unknown'}
                      </span>
                    </td>

                    {/* Variants and Stock Badges */}
                    <td className="py-3.5 px-4">
                      <div className="flex flex-wrap gap-1.5 max-w-md">
                        {product.variants.map(v => (
                          <span
                            key={v.id}
                            className={`px-2 py-0.5 rounded-md text-[10px] font-semibold border ${
                              v.isShot
                                ? 'bg-purple-50 border-purple-200 text-purple-700 dark:bg-purple-950/40 dark:border-purple-900 dark:text-purple-300'
                                : v.stock <= 0
                                ? 'bg-rose-50 border-rose-200 text-rose-700 dark:bg-rose-950/40 dark:border-rose-900 dark:text-rose-300'
                                : v.stock <= v.minStockLevel
                                ? 'bg-amber-50 border-amber-200 text-amber-700 dark:bg-amber-950/40 dark:border-amber-900 dark:text-amber-300'
                                : 'bg-slate-50 border-slate-200 text-slate-700 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300'
                            }`}
                          >
                            <strong>{v.size}</strong>: {currencySymbol}{v.sellingPrice.toLocaleString()} {v.isShot ? `(Shots left: ${v.stock})` : `(Qty: ${v.stock})`}
                          </span>
                        ))}
                      </div>
                    </td>

                    <td className="py-3.5 px-4 font-bold text-slate-900 dark:text-white">
                      {minPrice === maxPrice
                        ? `${currencySymbol} ${minPrice.toLocaleString()}`
                        : `${currencySymbol} ${minPrice.toLocaleString()} – ${currencySymbol} ${maxPrice.toLocaleString()}`}
                    </td>

                    <td className="py-3.5 px-4 text-center">
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                          product.isActive
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                            : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {product.isActive ? 'ACTIVE' : 'INACTIVE'}
                      </span>
                    </td>

                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => openEditModal(product)}
                          className="p-1.5 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/50 rounded-lg transition-colors cursor-pointer"
                          title="Edit Product & Sizes"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleArchiveProduct(product)}
                          className="p-1.5 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/50 rounded-lg transition-colors cursor-pointer"
                          title="Archive Product"
                        >
                          <Archive className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Product Create / Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl max-w-4xl w-full overflow-hidden flex flex-col max-h-[92vh]">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-5 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
              <div>
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                  {editingProduct ? `Edit Product: ${editingProduct.name}` : 'Add New Product & Multi-Size Variants'}
                </h2>
                <p className="text-xs text-slate-500">
                  Configure parent item, distillery brand, and individual bottle sizes/pricing
                </p>
              </div>
              <button onClick={() => setIsModalOpen(false)} className="p-2 text-slate-400 hover:text-slate-600 rounded-xl">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Form Content */}
            <form onSubmit={handleSaveProduct} className="flex-1 overflow-y-auto p-6 space-y-5">
              {errorMsg && (
                <div className="p-3 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 text-rose-700 dark:text-rose-300 rounded-xl text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}

              {/* General Info Row */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="sm:col-span-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-500 block mb-1">
                    Product Title *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Rockland Old Arrack (Gal Arrack)"
                    value={formName}
                    onChange={e => setFormName(e.target.value)}
                    className="w-full text-sm font-semibold px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-500 block mb-1">
                    Category *
                  </label>
                  <select
                    required
                    value={formCategoryId}
                    onChange={e => setFormCategoryId(e.target.value)}
                    className="w-full text-sm font-semibold px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-blue-500 cursor-pointer"
                  >
                    {categories.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c.type.toUpperCase()})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Brand & Kitchen Flag Row */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-500 block mb-1">
                    Brand / Distillery
                  </label>
                  <select
                    value={formCompanyId}
                    onChange={e => setFormCompanyId(e.target.value)}
                    className="w-full text-sm font-semibold px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-blue-500 cursor-pointer"
                  >
                    <option value="">-- In-House / None --</option>
                    {companies.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="sm:col-span-2 flex flex-col gap-2.5 pt-4">
                  <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-800 dark:text-slate-200">
                    <input
                      type="checkbox"
                      checked={formIsKitchen}
                      onChange={e => setFormIsKitchen(e.target.checked)}
                      className="w-4 h-4 text-blue-600 rounded"
                    />
                    <span>Kitchen Food Item (Triggers Kitchen Order Tickets KOT)</span>
                  </label>

                  <label className="flex items-start gap-2 cursor-pointer text-xs font-bold text-slate-800 dark:text-slate-200">
                    <input
                      type="checkbox"
                      checked={formServesShots}
                      onChange={e => handleToggleServesShots(e.target.checked)}
                      className="w-4 h-4 mt-0.5 text-amber-600 rounded"
                    />
                    <span>
                      🥃 Serves Shots (100ml / 50ml / 25ml)
                      <span className="block font-medium text-[11px] text-slate-500 mt-0.5">
                        Shot sizes hold NO separate stock — every shot sold is automatically deducted from the <strong>750ml Bottle total stock</strong>. When 750ml worth of shots is poured, the bottle count drops by 1.
                      </span>
                    </span>
                  </label>
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-slate-500 block mb-1">
                  Description / Tasting Notes
                </label>
                <textarea
                  rows={2}
                  placeholder="Optional product description..."
                  value={formDescription}
                  onChange={e => setFormDescription(e.target.value)}
                  className="w-full text-xs px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
                />
              </div>

              {/* Multi-Size Variants Table */}
              <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                      Bottle Sizes / Portions & Price Setup
                    </h3>
                    <p className="text-[11px] text-slate-500">
                      Each size holds independent stock, cost price, and selling price.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={addVariantRow}
                    className="px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-bold flex items-center gap-1 cursor-pointer transition-colors"
                  >
                    <PlusCircle className="w-3.5 h-3.5" />
                    + Add Another Size
                  </button>
                </div>

                <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold">
                        <th className="py-2.5 px-3">Size / Portion Name *</th>
                        <th className="py-2.5 px-3">SKU / Code</th>
                        <th className="py-2.5 px-3">Cost Price ({currencySymbol})</th>
                        <th className="py-2.5 px-3">Selling Price ({currencySymbol}) *</th>
                        <th className="py-2.5 px-3">Stock Qty</th>
                        <th className="py-2.5 px-3">Min Alert</th>
                        <th className="py-2.5 px-2 text-center">Del</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800 bg-white dark:bg-slate-900">
                      {formVariants.map((variant, idx) => (
                        <tr key={idx} className={variant.isShot ? 'bg-amber-50/60 dark:bg-amber-950/20' : ''}>
                          <td className="py-2 px-3">
                            {variant.isShot ? (
                              <div className="flex items-center gap-1.5">
                                <select
                                  value={variant.shotVolumeMl || 25}
                                  onChange={e => {
                                    const copy = [...formVariants];
                                    const vol = Number(e.target.value);
                                    copy[idx].shotVolumeMl = vol;
                                    copy[idx].size = `${vol}ml Shot`;
                                    setFormVariants(copy);
                                  }}
                                  className="px-2 py-1 bg-white dark:bg-slate-800 border border-amber-300 dark:border-amber-800 rounded-lg text-xs font-bold text-amber-800 dark:text-amber-300 cursor-pointer"
                                >
                                  <option value={100}>100ml</option>
                                  <option value={50}>50ml</option>
                                  <option value={25}>25ml</option>
                                </select>
                                <span className="text-[10px] font-black uppercase text-amber-700 dark:text-amber-400 whitespace-nowrap">
                                  Shot 🥃
                                </span>
                              </div>
                            ) : (
                              <input
                                type="text"
                                required
                                placeholder="e.g. 750ml, 375ml, Full"
                                value={variant.size}
                                onChange={e => {
                                  const copy = [...formVariants];
                                  copy[idx].size = e.target.value;
                                  setFormVariants(copy);
                                }}
                                className="w-full px-2 py-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-bold text-slate-900 dark:text-white"
                              />
                            )}
                          </td>
                          <td className="py-2 px-3">
                            <input
                              type="text"
                              placeholder="Auto/SKU"
                              value={variant.sku}
                              onChange={e => {
                                const copy = [...formVariants];
                                copy[idx].sku = e.target.value;
                                setFormVariants(copy);
                              }}
                              className="w-full px-2 py-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs"
                            />
                          </td>
                          <td className="py-2 px-3">
                            <input
                              type="number"
                              min="0"
                              value={variant.costPrice}
                              title={variant.isShot ? 'Leave 0 for automatic cost — calculated proportionally from the 750ml Bottle cost price' : undefined}
                              onChange={e => {
                                const copy = [...formVariants];
                                copy[idx].costPrice = Number(e.target.value);
                                setFormVariants(copy);
                              }}
                              className="w-24 px-2 py-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs"
                            />
                            {variant.isShot && !(Number(variant.costPrice) > 0) && (
                              <span className="block text-[9px] text-slate-400 mt-0.5">0 = auto from 750ml</span>
                            )}
                          </td>
                          <td className="py-2 px-3">
                            <input
                              type="number"
                              min="0"
                              required
                              value={variant.sellingPrice}
                              onChange={e => {
                                const copy = [...formVariants];
                                copy[idx].sellingPrice = Number(e.target.value);
                                setFormVariants(copy);
                              }}
                              className="w-24 px-2 py-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-bold text-blue-600"
                            />
                          </td>
                          <td className="py-2 px-3">
                            {variant.isShot ? (
                              <span
                                className="block w-20 px-2 py-1 text-[10px] font-bold text-amber-700 dark:text-amber-400 whitespace-nowrap"
                                title="Shots are automatically deducted from the 750ml Bottle total stock"
                              >
                                Auto — 750ml
                              </span>
                            ) : (
                              <input
                                type="number"
                                min="0"
                                value={variant.stock}
                                onChange={e => {
                                  const copy = [...formVariants];
                                  copy[idx].stock = Number(e.target.value);
                                  setFormVariants(copy);
                                }}
                                className="w-20 px-2 py-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-bold"
                              />
                            )}
                          </td>
                          <td className="py-2 px-3">
                            {variant.isShot ? (
                              <span className="block w-16 px-2 py-1 text-xs text-slate-400 text-center">—</span>
                            ) : (
                              <input
                                type="number"
                                min="0"
                                value={variant.minStockLevel}
                                onChange={e => {
                                  const copy = [...formVariants];
                                  copy[idx].minStockLevel = Number(e.target.value);
                                  setFormVariants(copy);
                                }}
                                className="w-16 px-2 py-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs text-slate-500"
                              />
                            )}
                          </td>
                          <td className="py-2 px-2 text-center">
                            <button
                              type="button"
                              onClick={() => removeVariantRow(idx)}
                              className="text-slate-400 hover:text-rose-500 p-1"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Modal Footer */}
              <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-black shadow-md transition-colors cursor-pointer"
                >
                  Save Product & Sizes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
