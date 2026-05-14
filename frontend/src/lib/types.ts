export type UserRole =
  | "ADMIN"
  | "WAREHOUSE_MANAGER"
  | "SALES"
  | "SELLER"
  | "CLIENT_B2B"
  | "CLIENT_B2C";

export type SellerStatus = "PENDING" | "APPROVED" | "REJECTED" | "SUSPENDED";

export interface Seller {
  id: number;
  name: string;
  slug: string;
  nit: string;
  contact_email: string;
  phone: string | null;
  address: string | null;
  city: string | null;
  description: string | null;
  logo_url: string | null;
  status: SellerStatus;
  rejection_reason: string | null;
  is_house: boolean;
  owner_user_id: number | null;
  created_at: string;
}

export interface SellerSummary {
  id: number;
  name: string;
  slug: string;
  status: SellerStatus;
}

export interface SellerWithOwner extends Seller {
  owner: AdminUserView | null;
}

export type ProductType = "REPUESTO" | "LUBRICANTE" | "VEHICULO";

export interface Category {
  id: number;
  name: string;
  product_type: ProductType;
  parent_id: number | null;
}

// Warehouse declarado más abajo con seller_id opcional.

export interface ProductListItem {
  id: number;
  sku: string;
  name: string;
  product_type: ProductType;
  base_price: string;
  currency: string;
  is_active: boolean;
  total_available: number;
  is_sold_out: boolean;
  seller_id: number;
  seller_name: string | null;
  seller_slug: string | null;
}

export interface StockByWarehouse {
  warehouse_id: number;
  warehouse_code: string;
  warehouse_city: string;
  quantity: number;
  reserved: number;
  available: number;
  min_stock: number;
}

export interface Product extends ProductListItem {
  description: string | null;
  category_id: number | null;
  tax_rate: string;
  attributes: Record<string, unknown>;
  total_quantity: number;
  stock_by_warehouse: StockByWarehouse[];
}

export interface Warehouse {
  id: number;
  seller_id?: number;
  code: string;
  name: string;
  city: string;
  address: string | null;
  is_active: boolean;
}

export interface CartItem {
  id: number;
  product_id: number;
  product_name: string | null;
  sku: string | null;
  warehouse_id: number;
  warehouse_code: string | null;
  quantity: number;
  unit_price: string;
  subtotal: string;
  reserved_at: string;
}

export interface Cart {
  id: number;
  user_id: number;
  expires_at: string | null;
  items: CartItem[];
  subtotal: string;
}

export type OrderStatus =
  | "DRAFT"
  | "PENDING_APPROVAL"
  | "CONFIRMED"
  | "PAID"
  | "SHIPPED"
  | "DELIVERED"
  | "REJECTED"
  | "CANCELLED";

export type SalesChannel = "WEB" | "B2B_PORTAL" | "POS";
export type PaymentMethod = "QR" | "CASH" | "TRANSFER" | "CREDIT" | "CARD";

export interface OrderItem {
  product_id: number;
  warehouse_id: number;
  quantity: number;
  unit_price: string;
  discount: string;
  subtotal: string;
}

export interface OrderInvoiceSummary {
  id: number;
  invoice_number: string;
  status: InvoiceStatus;
  cuf: string | null;
  total: string;
}

export interface Order {
  id: number;
  order_number: string;
  seller_id?: number | null;
  customer_id: number;
  status: OrderStatus;
  channel: SalesChannel;
  payment_method: PaymentMethod | null;
  subtotal: string;
  tax: string;
  total: string;
  currency: string;
  notes: string | null;
  items: OrderItem[];
  invoice?: OrderInvoiceSummary | null;
}

export type InvoiceStatus = "PENDING" | "AUTHORIZED" | "REJECTED" | "CANCELLED";

export interface Invoice {
  id: number;
  order_id: number;
  invoice_number: string;
  cuf: string | null;
  cdc: string | null;
  authorization_code: string | null;
  issue_date: string;
  customer_nit: string;
  customer_name: string;
  subtotal: string;
  tax: string;
  total: string;
  status: InvoiceStatus;
  siat_response: string | null;
}

export type TransferStatus =
  | "REQUESTED"
  | "PICKING"
  | "IN_TRANSIT"
  | "RECEIVED"
  | "CANCELLED"
  | "REJECTED_MERMA";

export interface TransferItem {
  product_id: number;
  quantity: number;
}

export interface StockTransfer {
  id: number;
  transfer_number: string;
  origin_warehouse_id: number;
  destination_warehouse_id: number;
  status: TransferStatus;
  qr_token: string | null;
  requested_by: number | null;
  picked_by: number | null;
  received_by: number | null;
  dispatched_at: string | null;
  received_at: string | null;
  notes: string | null;
  items: TransferItem[];
}

export interface DashboardSummary {
  orders: { total: number; paid: number; pending_b2b: number };
  revenue_bob: number;
  invoices: { authorized: number; in_contingency: number };
  customers: number;
  products_active: number;
  stock_units: number;
}

export interface StockAlert {
  product_id: number;
  sku: string;
  name: string;
  total_quantity: number;
  min_stock_total: number;
  severity: "OUT_OF_STOCK" | "LOW_STOCK";
}

export interface InventoryMovement {
  id: number;
  product_id: number;
  warehouse_id: number;
  movement_type: string;
  quantity: number;
  reference_type: string | null;
  reference_id: number | null;
  notes: string | null;
  user_id: number | null;
}

export interface CreditLine {
  limit_amount: number;
  balance: number;
  available: number;
  is_active: boolean;
}

export interface AdminUserView {
  id: number;
  email: string;
  full_name: string;
  role: UserRole;
  is_active: boolean;
}

export interface SalesByWarehouse {
  warehouse_id: number;
  warehouse_code: string;
  city: string;
  units: number;
  revenue_bob: number;
}

export interface SalesByChannel {
  channel: string;
  orders: number;
  revenue_bob: number;
}

export interface DailySales {
  day: string | null;
  orders: number;
  revenue_bob: number;
}

export interface TopProduct {
  product_id: number;
  sku: string;
  name: string;
  units: number;
  revenue_bob: number;
}

export interface MovementReport {
  warehouse_id: number;
  movement_type: string;
  operations: number;
  units: number;
}
