"""Smoke tests for the invoke task collection."""

from invoke.collection import Collection

import tasks


def test_collection_loads() -> None:
    collection = Collection.from_module(tasks)
    assert "hello" in collection.task_names
