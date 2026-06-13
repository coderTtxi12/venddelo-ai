from app.db.base import Base, SoftDeleteMixin, TimestampMixin, UUIDPrimaryKeyMixin


def test_metadata_naming_convention_present():
    nc = Base.metadata.naming_convention
    assert "pk" in nc and "fk" in nc and "ix" in nc and "uq" in nc and "ck" in nc


def test_mixins_define_expected_columns():
    assert hasattr(UUIDPrimaryKeyMixin, "id")
    assert hasattr(TimestampMixin, "created_at")
    assert hasattr(TimestampMixin, "updated_at")
    assert hasattr(SoftDeleteMixin, "is_active")
    assert hasattr(SoftDeleteMixin, "deleted_at")
