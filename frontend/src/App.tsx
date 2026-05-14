import { Route, Routes } from "react-router-dom";
import Login from "@/pages/Login";
import Register from "@/pages/Register";
import RegisterSeller from "@/pages/RegisterSeller";
import Dashboard from "@/pages/Dashboard";
import Catalog from "@/pages/Catalog";
import ProductDetail from "@/pages/ProductDetail";
import Cart from "@/pages/Cart";
import MyOrders from "@/pages/MyOrders";
import B2BApprovals from "@/pages/B2BApprovals";
import Inventory from "@/pages/Inventory";
import Transfers from "@/pages/Transfers";
import ScanReceive from "@/pages/ScanReceive";
import Invoices from "@/pages/Invoices";
import Reports from "@/pages/Reports";
import AdminUsers from "@/pages/AdminUsers";
import AdminProducts from "@/pages/AdminProducts";
import AdminSellers from "@/pages/AdminSellers";
import SellerDashboard from "@/pages/SellerDashboard";
import SellerProducts from "@/pages/SellerProducts";
import SellerOrders from "@/pages/SellerOrders";
import POS from "@/pages/POS";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { RoleGuard } from "@/components/RoleGuard";

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/registro-empresa" element={<RegisterSeller />} />

      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        }
      />

      <Route
        path="/catalogo"
        element={
          <ProtectedRoute>
            <Catalog />
          </ProtectedRoute>
        }
      />
      <Route
        path="/catalogo/:id"
        element={
          <ProtectedRoute>
            <ProductDetail />
          </ProtectedRoute>
        }
      />

      <Route
        path="/carrito"
        element={
          <ProtectedRoute>
            <RoleGuard allow={["CLIENT_B2C", "CLIENT_B2B"]}>
              <Cart />
            </RoleGuard>
          </ProtectedRoute>
        }
      />
      <Route
        path="/mis-ordenes"
        element={
          <ProtectedRoute>
            <RoleGuard allow={["CLIENT_B2C", "CLIENT_B2B"]}>
              <MyOrders />
            </RoleGuard>
          </ProtectedRoute>
        }
      />

      <Route
        path="/pos"
        element={
          <ProtectedRoute>
            <RoleGuard allow={["ADMIN", "SALES", "WAREHOUSE_MANAGER", "SELLER"]}>
              <POS />
            </RoleGuard>
          </ProtectedRoute>
        }
      />

      <Route
        path="/aprobaciones"
        element={
          <ProtectedRoute>
            <RoleGuard allow={["ADMIN", "SALES", "SELLER"]}>
              <B2BApprovals />
            </RoleGuard>
          </ProtectedRoute>
        }
      />

      <Route
        path="/inventario"
        element={
          <ProtectedRoute>
            <RoleGuard allow={["ADMIN", "WAREHOUSE_MANAGER", "SELLER"]}>
              <Inventory />
            </RoleGuard>
          </ProtectedRoute>
        }
      />
      <Route
        path="/traspasos"
        element={
          <ProtectedRoute>
            <RoleGuard allow={["ADMIN", "WAREHOUSE_MANAGER"]}>
              <Transfers />
            </RoleGuard>
          </ProtectedRoute>
        }
      />
      <Route
        path="/recibir"
        element={
          <ProtectedRoute>
            <RoleGuard allow={["ADMIN", "WAREHOUSE_MANAGER"]}>
              <ScanReceive />
            </RoleGuard>
          </ProtectedRoute>
        }
      />

      <Route
        path="/facturas"
        element={
          <ProtectedRoute>
            <RoleGuard allow={["ADMIN", "SALES", "WAREHOUSE_MANAGER"]}>
              <Invoices />
            </RoleGuard>
          </ProtectedRoute>
        }
      />

      <Route
        path="/reportes"
        element={
          <ProtectedRoute>
            <RoleGuard allow={["ADMIN", "SALES"]}>
              <Reports />
            </RoleGuard>
          </ProtectedRoute>
        }
      />

      <Route
        path="/usuarios"
        element={
          <ProtectedRoute>
            <RoleGuard allow={["ADMIN"]}>
              <AdminUsers />
            </RoleGuard>
          </ProtectedRoute>
        }
      />

      <Route
        path="/admin/productos"
        element={
          <ProtectedRoute>
            <RoleGuard allow={["ADMIN"]}>
              <AdminProducts />
            </RoleGuard>
          </ProtectedRoute>
        }
      />

      <Route
        path="/admin/empresas"
        element={
          <ProtectedRoute>
            <RoleGuard allow={["ADMIN"]}>
              <AdminSellers />
            </RoleGuard>
          </ProtectedRoute>
        }
      />

      <Route
        path="/empresa"
        element={
          <ProtectedRoute>
            <RoleGuard allow={["SELLER"]}>
              <SellerDashboard />
            </RoleGuard>
          </ProtectedRoute>
        }
      />
      <Route
        path="/empresa/productos"
        element={
          <ProtectedRoute>
            <RoleGuard allow={["SELLER"]}>
              <SellerProducts />
            </RoleGuard>
          </ProtectedRoute>
        }
      />
      <Route
        path="/empresa/ventas"
        element={
          <ProtectedRoute>
            <RoleGuard allow={["SELLER"]}>
              <SellerOrders />
            </RoleGuard>
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}
