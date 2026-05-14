import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import type { ProductListItem, ProductType, SellerSummary } from "@/lib/types";
import { formatBOB } from "@/lib/format";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { FullPageSpinner } from "@/components/Spinner";
import { EmptyState } from "@/components/EmptyState";
import { SearchIcon } from "@/components/Icons";

const TYPE_LABEL: Record<ProductType, string> = {
  REPUESTO: "Repuestos",
  LUBRICANTE: "Lubricantes",
  VEHICULO: "Vehículos",
};

export default function Catalog() {
  const [products, setProducts] = useState<ProductListItem[]>([]);
  const [sellers, setSellers] = useState<SellerSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [type, setType] = useState<ProductType | "">("");
  const [sellerId, setSellerId] = useState<number | "">("");

  useEffect(() => {
    api
      .get<SellerSummary[]>("/sellers/public")
      .then((r) => setSellers(r.data))
      .catch(() => setSellers([]));
  }, []);

  useEffect(() => {
    setLoading(true);
    const params: Record<string, string | number> = {};
    if (search) params.q = search;
    if (type) params.product_type = type;
    if (sellerId !== "") params.seller_id = sellerId;
    api
      .get<ProductListItem[]>("/catalog/products", { params })
      .then((r) => setProducts(r.data))
      .finally(() => setLoading(false));
  }, [search, type, sellerId]);

  return (
    <div>
      <PageHeader
        title="Catálogo del marketplace"
        description="Repuestos, lubricantes y vehículos ofrecidos por las empresas vendedoras de la plataforma."
      />

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nombre o SKU…"
            className="input pl-9"
          />
        </div>
        <select
          value={type}
          onChange={(e) => setType(e.target.value as ProductType | "")}
          className="input max-w-[180px]"
        >
          <option value="">Todos los tipos</option>
          <option value="REPUESTO">Repuestos</option>
          <option value="LUBRICANTE">Lubricantes</option>
          <option value="VEHICULO">Vehículos</option>
        </select>
        <select
          value={sellerId}
          onChange={(e) =>
            setSellerId(e.target.value === "" ? "" : Number(e.target.value))
          }
          className="input max-w-[220px]"
        >
          <option value="">Todas las empresas</option>
          {sellers.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <FullPageSpinner label="Cargando catálogo…" />
      ) : products.length === 0 ? (
        <EmptyState
          title="Sin productos"
          description="No se encontraron productos con los filtros actuales."
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {products.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      )}
    </div>
  );
}

function ProductCard({ product }: { product: ProductListItem }) {
  const accent =
    product.product_type === "REPUESTO"
      ? "from-blue-500/10"
      : product.product_type === "LUBRICANTE"
        ? "from-amber-500/10"
        : "from-emerald-500/10";

  return (
    <Link
      to={`/catalogo/${product.id}`}
      className="group flex flex-col overflow-hidden rounded-xl bg-white shadow-soft ring-1 ring-ink-200 transition hover:shadow-card hover:ring-brand-200"
    >
      <div className={`relative h-32 bg-gradient-to-br ${accent} to-white`}>
        <div className="absolute right-3 top-3">
          {product.is_sold_out ? (
            <StatusBadge value="OUT_OF_STOCK" />
          ) : (
            <span className="badge bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-current opacity-80" />
              Disponible · {product.total_available}
            </span>
          )}
        </div>
        <div className="absolute bottom-3 left-3 text-[10px] uppercase tracking-wide text-ink-500">
          {TYPE_LABEL[product.product_type]}
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex-1">
          <div className="text-[11px] font-mono uppercase text-ink-400">
            {product.sku}
          </div>
          <div className="line-clamp-2 mt-0.5 text-sm font-semibold text-ink-900 group-hover:text-brand-700">
            {product.name}
          </div>
          {product.seller_name && (
            <div className="mt-1 inline-flex items-center gap-1 rounded-full bg-ink-100 px-2 py-0.5 text-[10px] font-medium text-ink-600">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-brand-500" />
              {product.seller_name}
            </div>
          )}
        </div>
        <div className="flex items-end justify-between">
          <div>
            <div className="text-xs text-ink-500">Precio</div>
            <div className="text-lg font-semibold text-ink-900">
              {formatBOB(product.base_price)}
            </div>
          </div>
          <span className="text-xs font-medium text-brand-700 group-hover:translate-x-0.5 transition">
            Ver detalle →
          </span>
        </div>
      </div>
    </Link>
  );
}
