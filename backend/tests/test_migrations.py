from pathlib import Path
import uuid

from alembic import command
from alembic.config import Config
from sqlalchemy import inspect


def test_migrations_upgrade_and_downgrade_in_isolated_schema(test_engine):
    schema = f"envirowatch_migration_test_{uuid.uuid4().hex}"
    configuration = Config(str(Path(__file__).resolve().parents[1] / "alembic.ini"))
    configuration.set_main_option("script_location", str(Path(__file__).resolve().parents[1] / "alembic"))
    engine = test_engine.engine.execution_options(schema_translate_map=None)
    with engine.begin() as connection:
        connection.exec_driver_sql(f'CREATE SCHEMA "{schema}"')
        try:
            connection.exec_driver_sql(f'SET LOCAL search_path TO "{schema}"')
            configuration.attributes["connection"] = connection
            command.upgrade(configuration, "head")
            tables = inspect(connection).get_table_names(schema=schema)
            assert "measurement_rollups" in tables
            assert "simulation_runs" in tables
            assert "measurements" in tables
            columns = {column["name"] for column in inspect(connection).get_columns("notification_attempts", schema=schema)}
            assert {"attempt_count", "next_attempt_at"} <= columns
            command.downgrade(configuration, "base")
            assert inspect(connection).get_table_names(schema=schema) == ["alembic_version"]
        finally:
            connection.exec_driver_sql(f'DROP SCHEMA "{schema}" CASCADE')
