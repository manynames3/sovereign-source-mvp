import hashlib
import os
from dataclasses import dataclass
from pathlib import Path
from uuid import uuid4

from fastapi import HTTPException, UploadFile


ALLOWED_EXTENSIONS = {".dxf", ".step", ".stp", ".stl", ".pdf"}


@dataclass(frozen=True)
class StoredFile:
    original_name: str
    extension: str
    storage_key: str
    path: Path
    size_bytes: int
    checksum: str


class LocalStorage:
    def __init__(self, base_dir: str | None = None) -> None:
        self.base_dir = Path(base_dir or os.getenv("METAL_QUOTE_UPLOAD_DIR", "uploads"))
        self.base_dir.mkdir(parents=True, exist_ok=True)

    async def save(self, upload: UploadFile) -> StoredFile:
        original_name = Path(upload.filename or "").name
        extension = Path(original_name).suffix.lower()
        if extension not in ALLOWED_EXTENSIONS:
            raise HTTPException(status_code=400, detail="Unsupported file type.")

        content = await upload.read()
        if not content:
            raise HTTPException(status_code=400, detail="Uploaded file is empty.")

        checksum = hashlib.sha256(content).hexdigest()
        storage_key = f"{uuid4().hex}{extension}"
        path = self.base_dir / storage_key
        path.write_bytes(content)
        return StoredFile(
            original_name=original_name,
            extension=extension.lstrip("."),
            storage_key=storage_key,
            path=path,
            size_bytes=len(content),
            checksum=f"sha256:{checksum}",
        )
