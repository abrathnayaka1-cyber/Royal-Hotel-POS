import React from 'react';
import { usePOS } from '../../context/POSContext.tsx';
import { Layers, Plus, Utensils, Wine, AlertTriangle } from 'lucide-react';

export const ProductGrid: React.FC = () => {
  const {
    products,
    categories,
    companies,
    selectedCategory,
    searchQuery,
    selectedCompany,
    openVariantModal,
    settings,
  } = usePOS();

  const currencySymbol = settings?.currencySymbol || 'Rs.';

  // Filter products
  const filteredProducts = products.filter(product => {
    if (!product.isActive || product.isArchived) return false;

    // Company filter
    if (selectedCompany !== 'all' && product.companyId !== selectedCompany) {
      return false;
    }

    // Category filter
    if (selectedCategory !== 'all') {
      if (selectedCategory.startsWith('type:')) {
        const type = selectedCategory.replace('type:', '');
        const cat = categories.find(c => c.id === product.categoryId);
        if (!cat || cat.type !== type) return false;
      } else if (product.categoryId !== selectedCategory) {
        return false;
      }
    }

    // Search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const matchName = product.name.toLowerCase().includes(q);
      const matchDesc = product.description?.toLowerCase().includes(q);
      const matchVariant = product.variants.some(
        v =>
          v.size.toLowerCase().includes(q) ||
          v.sku.toLowerCase().includes(q) ||
          (v.barcode && v.barcode.toLowerCase().includes(q))
      );
      if (!matchName && !matchDesc && !matchVariant) return false;
    }

    return true;
  });

  if (filteredProducts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-12 bg-white dark:bg-slate-900 rounded-xl border border-dashed border-slate-200 dark:border-slate-800 text-center">
        <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400 mb-3">
          <Layers className="w-6 h-6" />
        </div>
        <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">No products found</h3>
        <p className="text-xs text-slate-500 max-w-sm mt-1">
          Try changing the category or clearing the search query to see available bar & restaurant items.
        </p>
      </div>
    );
  }

  return (
    <div
      id="pos-products-grid"
      className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 gap-3.5"
    >
      {filteredProducts.map(product => {
        const category = categories.find(c => c.id === product.categoryId);
        const company = companies.find(c => c.id === product.companyId);
        const activeVariants = product.variants.filter(v => v.isActive);
        const minPrice = activeVariants.length > 0 ? Math.min(...activeVariants.map(v => v.sellingPrice)) : 0;
        // Shot variants share the 750ml bottle liquid — don't double-count them in total stock
        const totalStock = activeVariants.reduce((sum, v) => sum + (product.servesShots && v.isShot ? 0 : v.stock), 0);
        const isOutOfStock = totalStock <= 0;
        const isSingleVariant = activeVariants.length === 1;

        return (
          <div
            key={product.id}
            id={`product-card-${product.id}`}
            onClick={() => openVariantModal(product)}
            className={`bg-white dark:bg-slate-800/90 p-4 rounded-xl shadow-xs border border-slate-200 dark:border-slate-700/80 flex flex-col justify-between hover:border-blue-500 dark:hover:border-blue-400 hover:shadow-md transition-all duration-150 cursor-pointer select-none relative group ${
              isOutOfStock && !settings?.allowNegativeStock ? 'opacity-65' : ''
            }`}
          >
            <div>
              {/* Product Header / Brand */}
              <div className="flex items-center justify-between gap-1 mb-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider truncate max-w-[130px]">
                  {company?.name || category?.name || 'Beverage'}
                </span>
                {product.isKitchenItem ? (
                  <span className="text-[10px] font-bold text-orange-500 bg-orange-50 dark:bg-orange-950/40 px-1.5 py-0.5 rounded">
                    Kitchen
                  </span>
                ) : (
                  <span className="text-[10px] font-bold text-blue-500 bg-blue-50 dark:bg-blue-950/40 px-1.5 py-0.5 rounded">
                    Bar
                  </span>
                )}
              </div>

              {/* Product Name */}
              <p className="font-bold text-sm text-slate-800 dark:text-slate-100 leading-snug group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                {product.name}
              </p>
            </div>

            {/* Price & Stock info matching theme */}
            <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-700/60 flex items-end justify-between">
              <div>
                <p className="text-xs text-blue-600 dark:text-blue-400 font-bold uppercase tracking-tight">
                  {isSingleVariant
                    ? `${currencySymbol} ${minPrice.toLocaleString()}`
                    : `From ${currencySymbol} ${minPrice.toLocaleString()}`}
                </p>
                <div className="text-[11px] mt-0.5">
                  {isOutOfStock ? (
                    <span className="text-rose-500 font-bold uppercase text-[10px]">
                      Out of Stock
                    </span>
                  ) : (
                    <span className="text-slate-400">
                      Stock: {totalStock}
                    </span>
                  )}
                </div>
              </div>

              <div className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-200 group-hover:bg-blue-600 group-hover:text-white flex items-center justify-center transition-colors">
                <Plus className="w-4 h-4" />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

