import { FormEvent, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import type {
  Category,
  Product,
  ProductListItem,
  ProductType,
} from "@/lib/types";
import { formatBOB } from "@/lib/format";
import { Layout } from "@/components/Layout";
import { PageHeader } from "@/components/PageHeader";
import { FullPageSpinner } from "@/components/Spinner";
import { EmptyState } from "@/components/EmptyState";
import { EditIcon, PlusIcon } from "@/components/Icons";
import { useToast } from "@/contexts/ToastContext";

const TYPE_LABEL: Record<ProductType, string> = {
  REPUESTO: "Repuesto",
  LUBRICANTE: "Lubricante",
  VEHICULO: "Vehículo",
};

const TYPE_OPTIONS: ProductType[] = ["REPUESTO", "LUBRICANTE", "VEHICULO"];

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

const EMPTY: ProductForm = {
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

export default function SellerProducts() {
  const toast = useToast();
  const [products, setProducts] = useState<ProductListItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState<ProductType | "">("");
  const [editing, setEditing] = useState<Product | null>(null);
  const [creating, setCreating] = useState(false);

  const reload = async () => {
    setLoading(true);
    const [prods, cats] = await Promise.all([
      api.get<ProductListItem[]>("/catalog/my/products", {
        params: { limit: 500, only_active: false },
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
      filterType ? products.filter((p) => p.product_type === filterType) : products,
    [products, filterType]
  );

  if (loading) return <FullPageSpinner label="Cargando mis productos…" />;

  return (
    <Layout>
      <PageHeader
        title="Mis productos"
        description="Catálogo que tu empresa ofrece en la plataforma. Solo ves tus propios productos."
        actions={
          <button onClick={() => setCreating(!creating)} className="btn-primary">
            <PlusIcon className="h-4 w-4" /> Nuevo producto
          </button>
        }
      />

      {creating && (
        <SellerProductForm
          categories={categories}
          onCancel={() => setCreating(false)}
          onSaved={() => {
            setCreating(false);
            reload();
          }}
        />
      )}

      {editing && (
        <SellerProductForm
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
          {filtered.length} producto(s)
        </span>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title="Aún no tenés productos"
          description="Cargá tu primer producto con el botón Nuevo producto."
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
                        }}
                      >
                        <EditIcon className="h-3.5 w-3.5" /> Editar
                      </button>
                      <button
                        className="btn-ghost h-7 px-2 text-xs"
                        onClick={async () => {
                          try {
                            await api.patch(`/catalog/my/products/${p.id}`, {
                              is_active: !p.is_active,
                            });
                            toast.success(
                              p.is_active ? "Desactivado" : "Activado"
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
    </Layout>
  );
}

function SellerProductForm({
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
      : EMPTY
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
        await api.patch(`/catalog/my/products/${initial.id}`, {
          name: form.name,
          description: form.description || null,
          category_id: form.category_id ? Number(form.category_id) : null,
          base_price: form.base_price,
          tax_rate: form.tax_rate,
          is_active: form.is_active,
        });
        toast.success("Producto actualizado");
      } else {
        await api.post("/catalog/my/products", {
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
        {isEdit ? `Editar · ${initial!.sku}` : "Nuevo producto de mi empresa"}
      </h3>
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
            placeholder="MIEMPRESA-0001"
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
            onChange={(e) => setForm({ ...form, category_id: e.target.value })}
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
          <span className="label">IVA (0.13 = 13%)</span>
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
            onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
          />
          <span className="text-sm text-ink-700">
            Activo (visible en catálogo público)
          </span>
        </label>
      </div>
      <div className="mt-4 flex gap-2">
        <button type="submit" disabled={submitting} className="btn-primary">
          {submitting
            ? "Guardando…"
            : isEdit
              ? "Guardar cambios"
              : "Crear producto"}
        </button>
        <button type="button" onClick={onCancel} className="btn-ghost">
          Cancelar
        </button>
      </div>
    </form>
  );
}
