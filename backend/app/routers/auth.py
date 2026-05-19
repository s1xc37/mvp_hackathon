from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter(prefix="/api/auth", tags=["auth"])


class AuthBody(BaseModel):
    username: str = ""
    email: str = ""
    password: str = ""


@router.post("/login")
async def login(body: AuthBody) -> dict:
    return {"ok": True, "message": "Вход выполнен", "username": body.username}


@router.post("/register")
async def register(body: AuthBody) -> dict:
    return {"ok": True, "message": "Регистрация успешна"}
