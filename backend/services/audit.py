from sqlalchemy.orm import Session

from backend.models import AuditEvent


def record_audit(db: Session, *, entity_type: str, entity_id: str, action: str, metadata: dict) -> None:
    db.add(
        AuditEvent(
            entity_type=entity_type,
            entity_id=entity_id,
            action=action,
            metadata_json=metadata,
        ),
    )
