from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.database import init_db
from backend.routers import access, admin, final_quote, orders, payments, quote, rfq


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    init_db()
    yield


app = FastAPI(
    title="Metal Part Quote-to-Order API",
    version="0.1.0",
    description="Budgetary estimate to RFQ, human review, final quote, mock payment, and order workflow.",
    lifespan=lifespan,
)

allowed_origins = [
    origin.strip()
    for origin in os.getenv(
        "METAL_QUOTE_CORS_ORIGINS",
        "http://localhost:3000,https://sovereign-source-mvp.pages.dev",
    ).split(",")
    if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


app.include_router(quote.router)
app.include_router(rfq.router)
app.include_router(admin.router)
app.include_router(final_quote.router)
app.include_router(payments.router)
app.include_router(orders.router)
app.include_router(access.router)
