# Plan AUP — 16 semanas (7 transcurridas)

Ya pasaron 7 semanas sobre 16 → quedan **9 semanas efectivas**. Esto obliga a reconfigurar: no hacemos las 4 fases AUP como libro de texto, priorizamos lo crítico para una entrega funcional en el plazo real.

## Estado a hoy (semana 8 aprox.)

- ✅ Scaffold del backend (FastAPI + SQLAlchemy + Alembic)
- ✅ Modelado inicial del dominio (10 entidades: usuarios, clientes, productos, inventario, órdenes, facturas, notas de remisión, pagos)
- ✅ Auth JWT + RBAC
- ✅ Docker Compose para desarrollo local
- ⏳ Migraciones Alembic (pendiente autogenerar tras instalar deps)
- ⏳ Endpoints CRUD de productos, inventario, órdenes
- ⏳ Integración SIAT
- ⏳ Frontend

## Semanas 8–16 (restantes)

| Semana | Foco | Entregable |
|--------|------|------------|
| **8** | Deps instaladas + migración inicial + seed de datos (almacenes LP/CBB/SCZ, admin, catálogo demo) | DB operativa, `/docs` muestra endpoints de auth |
| **9** | CRUD productos (3 tipos) + inventario multi-almacén | API para ABM de catálogo desde Postman |
| **10** | Motor de órdenes B2C: carrito → confirmación → reserva de stock con `FOR UPDATE` | Flujo de compra B2C testeado |
| **11** | B2B: precios mayoristas, líneas de crédito, descuentos por volumen | Cliente B2B puede colocar órdenes con su lista |
| **12** | **SIAT** — factura electrónica + Nota de Remisión (crítico, bloqueante) | Facturas autorizadas en ambiente de pruebas SIAT |
| **13** | Pagos QR (integración con pasarela — definir cuál) | Orden pagable desde la web |
| **14** | Frontend: landing B2C + carrito + checkout (React + Vite) | UI funcional del happy path |
| **15** | Frontend admin: inventario, órdenes, dashboards | Panel operativo |
| **16** | Despliegue Azure + hardening + UAT + documentación final | Producción + entrega |

## Riesgos y mitigaciones

| Riesgo | Mitigación |
|--------|------------|
| Credenciales SIAT tardan en llegar | Pedirlas ya. Mientras: implementar interfaz del servicio con mock; cambiar a real sin tocar callers. |
| Concurrencia en inventario (overselling) | `SELECT ... FOR UPDATE` con tests de carga en semana 10. |
| Frontend queda corto de tiempo | Arrancar el scaffold de React ya en semana 9 en paralelo, no recién en 14. |
| Migraciones rotas en producción | Revisar cada `alembic revision --autogenerate` a mano; no ejecutar `upgrade head` sin backup. |

## Política de calidad (ISO/IEC 25010)

- **Fiabilidad:** transacciones ACID en órdenes, reintentos en SIAT, backups diarios.
- **Seguridad:** TLS, JWT, bcrypt, RBAC, params ligados.
- **Mantenibilidad:** capas claras (api → services → models), tests unitarios del motor de precios y del reservador de stock.
- **Rendimiento:** índices en SKU, `product_type`, `warehouse_id`; paginación en listados.
