import { FormEvent, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import type {
  Category,
  Product,
  ProductListItem,
  ProductType,
} from "@/lib/types";
import { formatBOB } from "@/lib/format";
import { PageHeader } from "@/components/PageHeader";
import { FullPageSpinner } from "@/components/Spinner";
import { EmptyState } from "@/components/EmptyState";
import { EditIcon, PlusIcon, TagIcon } from "@/components/Icons";
import { useToast } from "@/contexts/ToastContext";

const TYPE_LABEL: Record<ProductType, string> = {
  REPUESTO: "Repuesto",
  LUBRICANTE: "Lubricante",
  VEHICULO: "Vehículo",
};

const TYPE_OPTIONS: ProductType[] = ["REPUESTO", "LUBRICANTE", "VEHICULO"];

type Mode = "list" | "new-product" | "new-category";

interface ProductForm {
  sku: string;
  name: string;
  description: string;
  product_type: ProductType;
  category_id: string;
  base_price: string;
  currency: string;
  tax_rate: string;
  is_active: boolean;
}

const EMPTY_PRODUCT: ProductForm = {
  sku: "",
  name: "",
  description: "",
  product_type: "REPUESTO",
  category_id: "",
  base_price: "",
  currency: "BOB",
  tax_rate: "0.13",
  is_active: true,
};

export default function AdminProducts() {
  const toast = useToast();
  const [products, setProducts] = useState<ProductListItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<Mode>("list");
  const [editing, setEditing] = useState<Product | null>(null);
  const [filterType, setFilterType] = useState<ProductType | "">("");

  const reload = async () => {
    setLoading(true);
    const [prods, cats] = await Promise.all([
      api.get<ProductListItem[]>("/catalog/products", {
        params: { limit: 200, only_active: false, include_sold_out: true },
      }),
      api.get<Category[]>("/catalog/categories"),
    ]);
    setProducts(prods.data);
    setCategories(cats.data);
    setLoading(false);
  };

  useEffect(() => {
    reload();
  }, []);

  const filtered = useMemo(
    () =>
      filterType
        ? products.filter((p) => p.product_type === filterType)
        : products,
    [products, filterType]
  );

  if (loading) return <FullPageSpinner label="Cargando productos…" />;

  return (
    <div>
      <PageHeader
        title="Gestión de productos"
        description="Alta, edición y categorización del catálogo. Las altas aparecen en /catalogo automáticamente al activarlas."
        actions={
          <div className="flex gap-2">
            <button
              onClick={() =>
                setMode(mode === "new-category" ? "list" : "new-category")
              }
              className="btn-ghost"
            >
              <TagIcon className="h-4 w-4" /> Nueva categoría
            </button>
            <button
              onClick={() => {
                setEditing(null);
                setMode(mode === "new-product" ? "list" : "new-product");
              }}
              className="btn-primary"
            >
              <PlusIcon className="h-4 w-4" /> Nuevo producto
            </button>
          </div>
        }
      />

      {mode === "new-category" && (
        <NewCategoryForm
          onSaved={() => {
            setMode("list");
            reload();
          }}
        />
      )}

      {mode === "new-product" && (
        <ProductForm
          categories={categories}
          onCancel={() => setMode("list")}
          onSaved={() => {
            setMode("list");
            reload();
          }}
        />
      )}

      {editing && (
        <ProductForm
          categories={categories}
          initial={editing}
          onCancel={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            reload();
          }}
        />
      )}

      <div className="mb-3 mt-2 flex flex-wrap items-center gap-3">
        <select
          value={filterType}
          onChange={(e) =>
            setFilterType((e.target.value as ProductType) || "")
          }
          className="input max-w-[200px]"
        >
          <option value="">Todos los tipos</option>
          {TYPE_OPTIONS.map((t) => (
            <option key={t} value={t}>
              {TYPE_LABEL[t]}
            </option>
          ))}
        </select>
        <span className="text-xs text-ink-500">
          {filtered.length} de {products.length} producto(s)
        </span>
      </div>

      <CategoriesPanel categories={categories} />

      {filtered.length === 0 ? (
        <EmptyState
          title="Sin productos"
          description="Creá tu primer producto con el botón superior derecho."
        />
      ) : (
        <div className="card-section overflow-hidden">
          <table className="table">
            <thead>
              <tr>
                <th>SKU</th>
                <th>Nombre</th>
                <th>Tipo</th>
                <th className="text-right">Precio</th>
                <th className="text-right">Stock</th>
                <th>Estado</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr key={p.id}>
                  <td className="font-mono text-xs">{p.sku}</td>
                  <td>{p.name}</td>
                  <td className="text-xs uppercase text-ink-500">
                    {TYPE_LABEL[p.product_type]}
                  </td>
                  <td className="text-right">{formatBOB(p.base_price)}</td>
                  <td className="text-right">{p.total_available}</td>
                  <td>
                    {p.is_active ? (
                      <span className="badge bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200">
                        Activo
                      </span>
                    ) : (
                      <span className="badge bg-ink-100 text-ink-600 ring-1 ring-ink-200">
                        Inactivo
                      </span>
                    )}
                  </td>
                  <td className="text-right">
                    <div className="flex justify-end gap-1">
                      <button
                        className="btn-ghost h-7 px-2 text-xs"
                        onClick={async () => {
                          const r = await api.get<Product>(
                            `/catalog/products/${p.id}`
                          );
                          setEditing(r.data);
                          setMode("list");
                        }}
                      >
                        <EditIcon className="h-3.5 w-3.5" /> Editar
                      </button>
                      <button
                        className="btn-ghost h-7 px-2 text-xs"
                        onClick={async () => {
                          try {
                            await api.patch(`/catalog/products/${p.id}`, {
                              is_active: !p.is_active,
                            });
                            toast.success(
                              p.is_active
                                ? "Producto desactivado"
                                : "Producto activado"
                            );
                            reload();
                          } catch {
                            toast.error("Error al actualizar");
                          }
                        }}
                      >
                        {p.is_active ? "Desactivar" : "Activar"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function CategoriesPanel({ categories }: { categories: Category[] }) {
  if (categories.length === 0) return null;
  const grouped: Record<ProductType, Category[]> = {
    REPUESTO: [],
    LUBRICANTE: [],
    VEHICULO: [],
  };
  categories.forEach((c) => grouped[c.product_type].push(c));

  return (
    <details className="mb-4 rounded-xl bg-white p-4 shadow-soft ring-1 ring-ink-200">
      <summary className="cursor-pointer text-sm font-semibold text-ink-900">
        Categorías existentes ({categories.length})
      </summary>
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {TYPE_OPTIONS.map((t) => (
          <div key={t}>
            <div className="mb-1 text-xs uppercase tracking-wide text-ink-500">
              {TYPE_LABEL[t]}
            </div>
            {grouped[t].length === 0 ? (
              <div className="text-xs text-ink-400">— sin categorías —</div>
            ) : (
              <ul className="space-y-1">
                {grouped[t].map((c) => (
                  <li
                    key={c.id}
                    className="flex items-center gap-2 text-sm text-ink-700"
                  >
                    <span className="badge bg-ink-100 text-ink-700 ring-1 ring-ink-200">
                      {c.id}
                    </span>
                    {c.name}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    </details>
  );
}

function NewCategoryForm({ onSaved }: { onSaved: () => void }) {
  const toast = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    name: "",
    product_type: "REPUESTO" as ProductType,
  });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.post("/catalog/categories", form);
      toast.success("Categoría creada");
      onSaved();
    } catch (err: unknown) {
      // @ts-expect-error axios shape
      const detail = err?.response?.data?.detail ?? "Error";
      toast.error(typeof detail === "string" ? detail : "Error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit} className="card mb-6">
      <h3 className="text-sm font-semibold text-ink-900">Nueva categoría</h3>
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label>
          <span className="label">Nombre</span>
          <input
            required
            minLength={2}
            className="input mt-1"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Filtros de aire, Aceites sintéticos…"
          />
        </label>
        <label>
          <span className="label">Tipo de producto</span>
          <select
            className="input mt-1"
            value={form.product_type}
            onChange={(e) =>
              setForm({ ...form, product_type: e.target.value as ProductType })
            }
          >
            {TYPE_OPTIONS.map((t) => (
              <option key={t} value={t}>
                {TYPE_LABEL[t]}
              </option>
            ))}
          </select>
        </label>
      </div>
      <button type="submit" disabled={submitting} className="btn-primary mt-4">
        {submitting ? "Creando…" : "Crear categoría"}
      </button>
    </form>
  );
}

function ProductForm({
  categories,
  initial,
  onSaved,
  onCancel,
}: {
  categories: Category[];
  initial?: Product;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const toast = useToast();
  const isEdit = !!initial;
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState<ProductForm>(
    initial
      ? {
          sku: initial.sku,
          name: initial.name,
          description: initial.description ?? "",
          product_type: initial.product_type,
          category_id: initial.category_id ? String(initial.category_id) : "",
          base_price: String(initial.base_price),
          currency: initial.currency,
          tax_rate: String(initial.tax_rate),
          is_active: initial.is_active,
        }
      : EMPTY_PRODUCT
  );

  const filteredCats = categories.filter(
    (c) => c.product_type === form.product_type
  );

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.base_price || Number(form.base_price) < 0) {
      toast.error("Precio inválido");
      return;
    }
    setSubmitting(true);
    try {
      if (isEdit && initial) {
        await api.patch(`/catalog/products/${initial.id}`, {
          name: form.name,
          description: form.description || null,
          category_id: form.category_id ? Number(form.category_id) : null,
          base_price: form.base_price,
          tax_rate: form.tax_rate,
          is_active: form.is_active,
        });
        toast.success("Producto actualizado");
      } else {
        await api.post("/catalog/products", {
          sku: form.sku.trim(),
          name: form.name.trim(),
          description: form.description || null,
          product_type: form.product_type,
          category_id: form.category_id ? Number(form.category_id) : null,
          base_price: form.base_price,
          currency: form.currency,
          tax_rate: form.tax_rate,
          is_active: form.is_active,
          attributes: {},
        });
        toast.success("Producto creado");
      }
      onSaved();
    } catch (err: unknown) {
      // @ts-expect-error axios shape
      const detail = err?.response?.data?.detail ?? "Error";
      toast.error(typeof detail === "string" ? detail : "Error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit} className="card mb-6">
      <h3 className="text-sm font-semibold text-ink-900">
        {isEdit ? `Editar producto · ${initial!.sku}` : "Nuevo producto"}
      </h3>
      {!isEdit && (
        <p className="mt-1 text-xs text-ink-500">
          El stock inicial se crea desde <strong>Inventario → Ajuste de
          stock</strong> una vez guardado el producto.
        </p>
      )}
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label>
          <span className="label">SKU</span>
          <input
            required
            minLength={2}
            disabled={isEdit}
            className="input mt-1 font-mono uppercase"
            value={form.sku}
            onChange={(e) => setForm({ ...form, sku: e.target.value })}
            placeholder="REP-0002"
          />
        </label>
        <label>
          <span className="label">Tipo</span>
          <select
            disabled={isEdit}
            className="input mt-1"
            value={form.product_type}
            onChange={(e) =>
              setForm({
                ...form,
                product_type: e.target.value as ProductType,
                category_id: "",
              })
            }
          >
            {TYPE_OPTIONS.map((t) => (
              <option key={t} value={t}>
                {TYPE_LABEL[t]}
              </option>
            ))}
          </select>
        </label>
        <label className="sm:col-span-2">
          <span className="label">Nombre</span>
          <input
            required
            minLength={2}
            className="input mt-1"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </label>
        <label className="sm:col-span-2">
          <span className="label">Descripción</span>
          <textarea
            className="input mt-1 min-h-[72px]"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
        </label>
        <label>
          <span className="label">Categoría</span>
          <select
            className="input mt-1"
            value={form.category_id}
            onChange={(e) =>
              setForm({ ...form, category_id: e.target.value })
            }
          >
            <option value="">— sin categoría —</option>
            {filteredCats.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="label">Precio base (incluye IVA)</span>
          <input
            required
            type="number"
            min={0}
            step="0.01"
            className="input mt-1"
            value={form.base_price}
            onChange={(e) => setForm({ ...form, base_price: e.target.value })}
            placeholder="120.00"
          />
        </label>
        <label>
          <span className="label">Moneda</span>
          <select
            disabled={isEdit}
            className="input mt-1"
            value={form.currency}
            onChange={(e) => setForm({ ...form, currency: e.target.value })}
          >
            <option value="BOB">BOB</option>
            <option value="USD">USD</option>
          </select>
        </label>
        <label>
          <span className="label">IVA (decimal, 0.13 = 13%)</span>
          <input
            type="number"
            min={0}
            max={1}
            step="0.01"
            className="input mt-1"
            value={form.tax_rate}
            onChange={(e) => setForm({ ...form, tax_rate: e.target.value })}
          />
        </label>
        <label className="flex items-center gap-2 sm:col-span-2">
          <input
            type="checkbox"
            checked={form.is_active}
            onChange={(e) =>
              setForm({ ...form, is_active: e.target.checked })
            }
          />
          <span className="text-sm text-ink-700">
            Activo (visible en catálogo público)
          </span>
        </label>
      </div>
      <div className="mt-4 flex gap-2">
        <button type="submit" disabled={submitting} className="btn-primary">
          {submitting ? "Guardando…" : isEdit ? "Guardar cambios" : "Crear producto"}
        </button>
        <button type="button" onClick={onCancel} className="btn-ghost">
          Cancelar
        </button>
      </div>
    </form>
  );
}
