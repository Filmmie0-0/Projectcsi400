import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { storeService } from '../services/storeService';

export const storeKeys = {
  store: ['store'] as const,
  categories: ['store', 'categories'] as const,
  products: ['store', 'products'] as const,
};

export const useMyStore = () => useQuery({ queryKey: storeKeys.store, queryFn: storeService.getStore });
export const useCategories = () => useQuery({ queryKey: storeKeys.categories, queryFn: storeService.listCategories });
export const useStoreProducts = () => useQuery({ queryKey: storeKeys.products, queryFn: storeService.listProducts });

// ทุก mutation ของร้าน invalidate ['store', ...] ทั้งหมด เพราะสต็อก/หมวดหมู่กระทบกัน
function useStoreMutation<A extends unknown[], R>(fn: (...args: A) => Promise<R>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: A) => fn(...args),
    onSuccess: () => qc.invalidateQueries({ queryKey: storeKeys.store }),
  });
}

export const useUpdateStore = () => useStoreMutation(storeService.updateStore);
export const useAddCategory = () => useStoreMutation(storeService.addCategory);
export const useRemoveCategory = () => useStoreMutation(storeService.removeCategory);
export const useAddProduct = () => useStoreMutation(storeService.addProduct);
export const useUpdateProduct = () => useStoreMutation(storeService.updateProduct);
export const useDeleteProduct = () => useStoreMutation(storeService.deleteProduct);
export const useAdjustStock = () => useStoreMutation(storeService.adjustStock);
export const useApplyPreset = () => useStoreMutation(storeService.applyPreset);
