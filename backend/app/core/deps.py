import httpx

_client: httpx.AsyncClient | None = None


def get_http_client() -> httpx.AsyncClient:
    if _client is None:
        raise RuntimeError("HTTP client not initialized")
    return _client


async def startup() -> None:
    global _client
    _client = httpx.AsyncClient(timeout=10.0)


async def shutdown() -> None:
    global _client
    if _client:
        await _client.aclose()
        _client = None
