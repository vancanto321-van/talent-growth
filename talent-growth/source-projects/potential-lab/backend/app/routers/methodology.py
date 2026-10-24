"""方法论：每个问卷的理论来源、出题逻辑、计分方式、边界与参考文献。"""

from fastapi import APIRouter, Depends

from app.content_loader import methodology
from app.deps import get_current_user

router = APIRouter(prefix="/api/methodology", tags=["methodology"])


@router.get("")
def get_methodology(user: object = Depends(get_current_user)):
    data = methodology()
    return {
        "version": data["version"],
        "sections": data["sections"],
        "science_boundary": data.get("science_boundary"),
        "references": data["references"],
    }
