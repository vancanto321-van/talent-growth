"""方向库查询（内容来自 content/directions.yaml + tasks.yaml）。"""

from fastapi import APIRouter, Depends, HTTPException

from app.content_loader import directions, task_templates
from app.deps import get_current_user

router = APIRouter(prefix="/api/directions", tags=["directions"])


@router.get("")
def list_directions(user: object = Depends(get_current_user)):
    out = []
    for code, d in directions().items():
        task_count = sum(1 for t in task_templates().values() if t["direction_code"] == code)
        out.append({**d, "code": code, "task_count": task_count})
    return out


@router.get("/{code}")
def direction_detail(code: str, user: object = Depends(get_current_user)):
    if code not in directions():
        raise HTTPException(status_code=404, detail="方向不存在")
    templates = [
        t
        for t in task_templates().values()
        if t["direction_code"] == code
    ]
    templates.sort(key=lambda t: ["intro", "advanced", "transfer"].index(t["stage"]))
    return {**directions()[code], "code": code, "tasks": templates}
