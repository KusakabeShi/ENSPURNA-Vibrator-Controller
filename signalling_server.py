from typing import Dict

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import PlainTextResponse

app = FastAPI(title="Enspurna Signalling Server")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["GET", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"]
)

_offers: Dict[str, str] = {}
_answers: Dict[str, str] = {}


def _key(prefix: str, room_id: str) -> str:
    return f"{prefix}:{room_id}"


PREFIX = "sig"


def _validate_prefix(prefix: str) -> None:
    if prefix != PREFIX:
        raise HTTPException(status_code=404, detail="Unknown prefix")


@app.put("/{prefix}/{room_id}/offer", status_code=204)
async def put_offer(prefix: str, room_id: str, request: Request):
    _validate_prefix(prefix)
    body = (await request.body()).decode("utf-8")
    if not body:
        raise HTTPException(status_code=400, detail="Offer body is empty")
    _offers[_key(prefix, room_id)] = body
    return PlainTextResponse("")


@app.get("/{prefix}/{room_id}/offer")
async def get_offer(prefix: str, room_id: str):
    _validate_prefix(prefix)
    key = _key(prefix, room_id)
    if key not in _offers:
        raise HTTPException(status_code=404, detail="Offer not found")
    return PlainTextResponse(_offers[key])


@app.put("/{prefix}/{room_id}/answer", status_code=204)
async def put_answer(prefix: str, room_id: str, request: Request):
    _validate_prefix(prefix)
    body = (await request.body()).decode("utf-8")
    if not body:
        raise HTTPException(status_code=400, detail="Answer body is empty")
    _answers[_key(prefix, room_id)] = body
    return PlainTextResponse("")


@app.delete("/{prefix}/{room_id}/answer")
async def delete_answer(prefix: str, room_id: str):
    _validate_prefix(prefix)
    key = _key(prefix, room_id)
    body = _answers.pop(key, None)
    if body is None:
        return PlainTextResponse("", status_code=204)
    return PlainTextResponse(body)


@app.get("/health", tags=["health"])
async def healthcheck():
    return {"status": "ok"}
