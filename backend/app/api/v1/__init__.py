from fastapi import APIRouter

from app.api.v1 import (
    auth,
    b2b,
    cart,
    catalog,
    health,
    inventory,
    invoices,
    pos,
    reports,
    sellers,
    transfers,
    users,
    warehouses,
)

api_router = APIRouter(prefix="/api/v1")
api_router.include_router(health.router)
api_router.include_router(auth.router)
api_router.include_router(users.router)
api_router.include_router(sellers.router)
api_router.include_router(warehouses.router)
api_router.include_router(catalog.router)
api_router.include_router(inventory.router)
api_router.include_router(cart.router)
api_router.include_router(b2b.router)
api_router.include_router(pos.router)
api_router.include_router(transfers.router)
api_router.include_router(invoices.router)
api_router.include_router(reports.router)
